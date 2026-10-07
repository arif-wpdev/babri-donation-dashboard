import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isMfaConfigurationReady, isOtpChallengeUsable, nextOtpFailure, normalizeIdentifier, OTP_LOCK_DURATION_MS, OTP_MAX_FAILED_ATTEMPTS, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";

const schema = z.object({ identifier: z.string().min(8).max(32), otp: z.string().regex(/^\d{6}$/), newPassword: z.string().min(12).max(256).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/) });

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Password recovery is temporarily unavailable." }, { status: 503 });
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Invalid reset details." }, { status: 400 });
    const identifier = normalizeIdentifier(parsed.data.identifier);
    if (!/^\+[1-9]\d{7,14}$/.test(identifier)) return Response.json({ error: "Invalid or expired reset code." }, { status: 400 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `password-reset-verify:${hashAuthValue(identifier, "account")}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `password-reset-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Password recovery is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const user = await prisma.user.findFirst({
      where: { phone: identifier, phoneVerifiedAt: { not: null }, OR: [{ orgId: null }, { org: { deletedAt: null } }] },
      select: { id: true, role: true, passwordHash: true },
    });
    if (!user || (user.role !== "SUPER_ADMIN" && user.passwordHash === null)) return Response.json({ error: "Invalid or expired reset code." }, { status: 400 });
    const identifierHash = hashAuthValue(user.id, "password-reset");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PASSWORD_RESET" } } });
    const now = new Date();
      if (!challenge || !isOtpChallengeUsable(challenge, now, OTP_MAX_FAILED_ATTEMPTS)) return Response.json({ error: "Invalid or expired reset code." }, { status: 400 });
    const activeOtpHash = challenge.otpHash;
    if (!activeOtpHash) return Response.json({ error: "Invalid or expired reset code." }, { status: 400 });
    if (!verifyOtpHash(activeOtpHash, parsed.data.otp)) {
      const failed = await prisma.$transaction(async (tx) => {
        const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
        if (!current || current.otpHash !== activeOtpHash || current.failedAttempts !== challenge.failedAttempts || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now || current.lockedUntil && current.lockedUntil > now) return null;
        const failure = nextOtpFailure(current.failedAttempts, now, OTP_MAX_FAILED_ATTEMPTS, OTP_LOCK_DURATION_MS);
        const updated = await tx.authChallenge.updateMany({ where: { id: current.id, failedAttempts: current.failedAttempts, otpHash: activeOtpHash, consumedAt: null, lockedUntil: current.lockedUntil }, data: { failedAttempts: failure.attempts, ...(failure.lockedUntil && { lockedUntil: failure.lockedUntil, otpHash: null }) } });
        return updated.count === 1 ? { attempts: failure.attempts, lockedUntil: failure.lockedUntil } : null;
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!failed) return Response.json({ error: "Reset state changed. Request a new code." }, { status: 409 });
      await writeSecurityEvent({ userId: user.id, eventType: failed.attempts >= 3 ? "OTP_LOCK" : "OTP_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "password_reset", attempts: failed.attempts } });
      return Response.json({ error: failed.attempts >= 3 ? "Password recovery is temporarily locked." : "Incorrect reset code.", attemptsRemaining: Math.max(0, 3 - failed.attempts) }, { status: failed.attempts >= 3 ? 429 : 400 });
    }
    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
    const completed = await prisma.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, otpHash: activeOtpHash, failedAttempts: { lt: OTP_MAX_FAILED_ATTEMPTS }, consumedAt: null, lockedUntil: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now, verifiedAt: now, otpHash: null } });
      if (claimed.count !== 1) return false;
      await tx.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: now } });
      await tx.authSession.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: now } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
    if (!completed) return Response.json({ error: "Reset code was already used or expired." }, { status: 409 });
    await writeSecurityEvent({ userId: user.id, eventType: "PASSWORD_CHANGED", ip, userAgent: request.headers.get("user-agent"), details: { method: "sms_otp_reset" } });
    return Response.json({ success: true, message: "Password reset. Please sign in with your new password." });
  } catch {
    console.error("[AUTH_PASSWORD_RESET_VERIFY] Reset verification failed");
    return Response.json({ error: "Password reset could not be completed." }, { status: 400 });
  }
}
