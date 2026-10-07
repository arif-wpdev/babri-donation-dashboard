import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { clearPreAuth, ensureSameOrigin, enforceRateLimits, getPreAuthUser, hashAuthValue, isMfaConfigurationReady, isOtpChallengeUsable, nextOtpFailure, prefersMobileAuthFlow, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";

const MAX_ATTEMPTS = 3;
const LOCK_MS = 24 * 60 * 60_000;

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Verification is temporarily unavailable." }, { status: 503 });
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your password again." }, { status: 401 });
    if (preAuth.preAuth.passkeyOnly) return Response.json({ error: "This trusted device requires its registered passkey." }, { status: 403 });
    if (preAuth.preAuth.deliveryChannel === "sms" && !preAuth.user.phoneVerifiedAt) return Response.json({ error: "Verification is temporarily unavailable." }, { status: 401 });
    const body = await request.json().catch(() => null) as { otp?: unknown } | null;
    if (!body || typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) return Response.json({ error: "Enter the six-digit verification code." }, { status: 400 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `otp-verify-user:${preAuth.user.id}`, limit: 10, windowMs: 24 * 60 * 60_000, blockMs: LOCK_MS },
      { key: `otp-verify-ip:${ip}`, limit: 30, windowMs: 24 * 60 * 60_000, blockMs: LOCK_MS },
    ]);
    if (!rate.allowed) return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const identifierHash = hashAuthValue(preAuth.user.id, "otp-identity");
    const now = new Date();
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "OTP" } } });
    if (!challenge || (challenge.lockedUntil && challenge.lockedUntil > now) || challenge.failedAttempts >= MAX_ATTEMPTS) {
      return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429 });
    }
    if (!isOtpChallengeUsable(challenge, now, MAX_ATTEMPTS)) {
      return Response.json({ error: "This code is invalid or expired. Request a new code." }, { status: 400 });
    }

    const activeOtpHash = challenge.otpHash;
    if (!activeOtpHash) return Response.json({ error: "This code is invalid or expired. Request a new code." }, { status: 400 });
    const verified = verifyOtpHash(activeOtpHash, body.otp);
    if (!verified) {
      const failedResult = await prisma.$transaction(async (tx) => {
        const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
        if (!current || current.otpHash !== activeOtpHash || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now || current.lockedUntil && current.lockedUntil > now) return null;
        const failure = nextOtpFailure(current.failedAttempts, now, MAX_ATTEMPTS, LOCK_MS);
        const failedAttempts = failure.attempts;
        const lockedUntil = failure.lockedUntil ?? undefined;
        const updated = await tx.authChallenge.updateMany({ where: { id: current.id, failedAttempts: current.failedAttempts, otpHash: activeOtpHash, consumedAt: null, lockedUntil: current.lockedUntil }, data: { failedAttempts, ...(lockedUntil && { lockedUntil, otpHash: null, loginTicketHash: null, loginTicketExpiresAt: null }) } });
        return updated.count === 1 ? { failedAttempts, lockedUntil } : null;
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!failedResult) return Response.json({ error: "Verification state changed. Try the current code again." }, { status: 409 });
      if (failedResult.failedAttempts >= MAX_ATTEMPTS) {
        const lockedUntil = failedResult.lockedUntil ?? new Date(now.getTime() + LOCK_MS);
        await writeSecurityEvent({ userId: preAuth.user.id, eventType: "OTP_LOCK", ip, userAgent: request.headers.get("user-agent") });
        return Response.json({ error: "Verification is temporarily unavailable. Contact an administrator or use account recovery.", lockedUntil }, { status: 429 });
      }
      await writeSecurityEvent({ userId: preAuth.user.id, eventType: "OTP_FAILURE", ip, userAgent: request.headers.get("user-agent") });
      return Response.json({ error: "Incorrect code.", attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failedResult.failedAttempts) }, { status: 400 });
    }

    const ticket = randomBytes(32).toString("base64url");
    const ticketHash = createHash("sha256").update(ticket).digest("hex");
    const consumed = await prisma.$transaction(async (tx) => {
      const currentChallenge = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
      if (!currentChallenge || currentChallenge.failedAttempts >= MAX_ATTEMPTS || currentChallenge.lockedUntil && currentChallenge.lockedUntil > now) return false;
      const currentPreAuth = await tx.loginPreAuth.findUnique({ where: { id: preAuth.preAuth.id }, select: { userId: true, passkeyOnly: true, consumedAt: true, expiresAt: true } });
      if (!currentPreAuth || currentPreAuth.userId !== preAuth.user.id || currentPreAuth.passkeyOnly || currentPreAuth.consumedAt || currentPreAuth.expiresAt <= now) return false;
      const claimed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, otpHash: activeOtpHash, consumedAt: null, otpExpiresAt: { gt: now }, lockedUntil: null, failedAttempts: { lt: MAX_ATTEMPTS } },
        data: { consumedAt: now, verifiedAt: now, otpHash: null },
      });
      if (claimed.count !== 1) return false;
      const preAuthConsumed = await tx.loginPreAuth.updateMany({ where: { id: preAuth.preAuth.id, consumedAt: null, expiresAt: { gt: now }, passkeyOnly: false }, data: { consumedAt: now } });
      if (preAuthConsumed.count !== 1) throw new Error("Pre-authentication state already consumed");
      await tx.loginTicket.create({ data: { userId: preAuth.user.id, preauthId: preAuth.preAuth.id, tokenHash: ticketHash, expiresAt: new Date(now.getTime() + 2 * 60_000) } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!consumed) return Response.json({ error: "This code has already been used. Request a new code." }, { status: 409 });
    const offerPasskeyRegistration = prefersMobileAuthFlow(request.headers);
    await writeSecurityEvent({ userId: preAuth.user.id, eventType: "NEW_DEVICE", ip, userAgent: request.headers.get("user-agent"), details: { method: "otp_verified", passkeyOffered: offerPasskeyRegistration } });
    return Response.json({ success: true, loginTicket: ticket, expiresInSeconds: 120, offerPasskeyRegistration });
  } catch {
    console.error("[AUTH_OTP_VERIFY] OTP verification failed");
    return Response.json({ error: "Verification could not be completed" }, { status: 400 });
  }
}
