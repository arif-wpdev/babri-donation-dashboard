import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, nextOtpFailure, OTP_LOCK_DURATION_MS, OTP_MAX_FAILED_ATTEMPTS, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";
import { canBootstrapSuperAdminPhone } from "@/lib/auth-session-policy";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256), phone: z.string().regex(/^\+[1-9]\d{7,14}$/), otp: z.string().regex(/^\d{6}$/) });
const genericError = { error: "Phone verification failed. Check the details or request a new code." };

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json(genericError, { status: 400 });
    const email = parsed.data.email.trim().toLowerCase();
    const phone = parsed.data.phone;
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `superadmin-phone-verify:${hashAuthValue(email, "account")}`, limit: 10, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
      { key: `superadmin-phone-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 20, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, phoneVerifiedAt: true, passwordHash: true } });
    const validPassword = user?.passwordHash
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : false;
    if (!user || !canBootstrapSuperAdminPhone(user) || !validPassword) return Response.json(genericError, { status: 400 });

    const identifierHash = hashAuthValue(user.id, "superadmin-phone-bootstrap");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const now = new Date();
    if (!challenge?.otpHash || !challenge.otpExpiresAt || challenge.otpExpiresAt <= now || challenge.consumedAt || challenge.purpose !== phone || (challenge.lockedUntil && challenge.lockedUntil > now) || challenge.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS) return Response.json(genericError, { status: 400 });

    if (!verifyOtpHash(challenge.otpHash, parsed.data.otp)) {
      const failure = await prisma.$transaction(async (tx) => {
        const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
        if (!current || current.otpHash !== challenge.otpHash || current.purpose !== phone || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now || current.failedAttempts !== challenge.failedAttempts || (current.lockedUntil && current.lockedUntil > now)) return null;
        const next = nextOtpFailure(current.failedAttempts, now, OTP_MAX_FAILED_ATTEMPTS, OTP_LOCK_DURATION_MS);
        const updated = await tx.authChallenge.updateMany({
          where: { id: current.id, otpHash: challenge.otpHash, purpose: phone, failedAttempts: current.failedAttempts, consumedAt: null, lockedUntil: current.lockedUntil },
          data: { failedAttempts: next.attempts, ...(next.lockedUntil && { lockedUntil: next.lockedUntil, otpHash: null }) },
        });
        return updated.count === 1 ? next : null;
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!failure) return Response.json({ error: "Verification state changed. Request a new code." }, { status: 409 });
      await writeSecurityEvent({ userId: user.id, eventType: failure.lockedUntil ? "OTP_LOCK" : "OTP_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "superadmin_phone_bootstrap", attempts: failure.attempts } });
      return Response.json({ error: failure.lockedUntil ? "Verification is locked for 24 hours." : "Incorrect verification code.", attemptsRemaining: Math.max(0, OTP_MAX_FAILED_ATTEMPTS - failure.attempts) }, { status: failure.lockedUntil ? 429 : 400 });
    }

    const verified = await prisma.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.updateMany({
        where: { id: challenge.id, otpHash: challenge.otpHash, purpose: phone, failedAttempts: { lt: OTP_MAX_FAILED_ATTEMPTS }, consumedAt: null, lockedUntil: null, otpExpiresAt: { gt: now } },
        data: { consumedAt: now, verifiedAt: now, otpHash: null },
      });
      if (claimed.count !== 1) return false;
      const owner = await tx.user.findFirst({ where: { phone, NOT: { id: user.id } }, select: { id: true } });
      if (owner) throw new Error("PHONE_ALREADY_IN_USE");
      const updated = await tx.user.updateMany({ where: { id: user.id, role: "SUPER_ADMIN", phoneVerifiedAt: null }, data: { phone, phoneVerifiedAt: now } });
      return updated.count === 1;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!verified) return Response.json(genericError, { status: 409 });
    await writeSecurityEvent({ userId: user.id, eventType: "PHONE_VERIFICATION", ip, userAgent: request.headers.get("user-agent"), details: { method: "superadmin_bootstrap" } });
    return Response.json({ success: true, message: "Phone verified. You can now sign in with your phone number." });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    if (error instanceof Error && error.message === "PHONE_ALREADY_IN_USE") return Response.json(genericError, { status: 409 });
    console.error("[AUTH_SUPERADMIN_PHONE_BOOTSTRAP_VERIFY] Verification failed");
    return Response.json(genericError, { status: 400 });
  }
}
