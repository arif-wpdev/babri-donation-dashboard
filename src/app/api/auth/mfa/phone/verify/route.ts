import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";
import { requireAuth, ApiError } from "@/lib/rbac";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    const rate = await enforceRateLimits([{ key: `phone-verify-code:${user.id}`, limit: 10, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 }, { key: `phone-verify-code-ip:${requestIp(request.headers)}`, limit: 30, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 }]);
    if (!rate.allowed) return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 429 });
    const body = await request.json().catch(() => null) as { otp?: unknown; phone?: unknown } | null;
    if (typeof body?.otp !== "string" || !/^\d{6}$/.test(body.otp) || typeof body.phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(body.phone)) return Response.json({ error: "Invalid phone or verification code." }, { status: 400 });
    const phone = body.phone;
    const otp = body.otp;
    const identifierHash = hashAuthValue(user.id, "phone-verification");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const now = new Date();
    if (!challenge?.otpHash || !challenge.otpExpiresAt || challenge.otpExpiresAt <= now || challenge.lockedUntil && challenge.lockedUntil > now || challenge.failedAttempts >= 3 || challenge.consumedAt || challenge.purpose !== phone) return Response.json({ error: "Verification code is invalid or expired." }, { status: 400 });
    if (!verifyOtpHash(challenge.otpHash, otp)) {
      const failed = await prisma.$transaction(async (tx) => {
        const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
        if (!current || current.otpHash !== challenge.otpHash || current.purpose !== phone || current.failedAttempts !== challenge.failedAttempts || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now) return null;
        const attempts = current.failedAttempts + 1;
        const lockedUntil = attempts >= 3 ? new Date(now.getTime() + 24 * 60 * 60_000) : null;
        const updated = await tx.authChallenge.updateMany({ where: { id: current.id, failedAttempts: current.failedAttempts, otpHash: current.otpHash, consumedAt: null }, data: { failedAttempts: attempts, ...(lockedUntil && { lockedUntil, otpHash: null }) } });
        return updated.count === 1 ? { attempts, lockedUntil } : null;
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!failed) return Response.json({ error: "Verification state changed. Request a new code." }, { status: 409 });
      const attempts = failed.attempts;
      await writeSecurityEvent({ userId: user.id, eventType: attempts >= 3 ? "OTP_LOCK" : "OTP_FAILURE", ip: requestIp(request.headers), details: { purpose: "phone_verification", attempts } });
      return Response.json({ error: attempts >= 3 ? "Phone verification is temporarily locked." : "Incorrect code.", attemptsRemaining: Math.max(0, 3 - attempts) }, { status: attempts >= 3 ? 429 : 400 });
    }
    await prisma.$transaction(async (tx) => {
      const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
      if (!current || current.purpose !== body.phone || current.failedAttempts !== challenge.failedAttempts || current.lockedUntil || current.consumedAt || current.otpHash !== challenge.otpHash) throw new Error("Verification state changed");
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, otpHash: challenge.otpHash, purpose: phone, consumedAt: null, otpExpiresAt: { gt: now }, failedAttempts: { lt: 3 }, lockedUntil: null }, data: { consumedAt: now, verifiedAt: now, otpHash: null } });
      if (claimed.count !== 1) throw new Error("Verification was already consumed");
      const existingPhone = await tx.user.findFirst({ where: { phone, NOT: { id: user.id } }, select: { id: true } });
      if (existingPhone) throw new Error("Phone number already assigned");
      await tx.user.update({ where: { id: user.id }, data: { phone: challenge.purpose!, phoneVerifiedAt: now } });
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    await writeSecurityEvent({ userId: user.id, eventType: "PHONE_VERIFICATION", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent") });
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[AUTH_PHONE_VERIFY] Phone verification failed");
    return Response.json({ error: "Phone verification failed" }, { status: 400 });
  }
}
