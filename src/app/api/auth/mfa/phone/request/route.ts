import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isOtpDeliveryReady, randomOtp, requestIp, writeSecurityEvent, deliverOtp } from "@/lib/auth-security";
import { requireAuth } from "@/lib/rbac";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    const rate = await enforceRateLimits([{ key: `phone-verify:${user.id}`, limit: 3, windowMs: 60 * 60_000, blockMs: 60 * 60_000 }, { key: `phone-verify-ip:${requestIp(request.headers)}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 }]);
    if (!rate.allowed) return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    if (!isOtpDeliveryReady("sms")) return Response.json({ error: "SMS verification is not configured." }, { status: 503 });
    const body = await request.json() as { phone?: unknown };
    const phone = body.phone;
    if (typeof phone !== "string" || !/^\+[1-9]\d{7,14}$/.test(phone)) return Response.json({ error: "Enter a valid E.164 phone number." }, { status: 400 });
    const exists = await prisma.user.findFirst({ where: { phone, NOT: { id: user.id } }, select: { id: true } });
    if (exists) return Response.json({ error: "This phone number cannot be used." }, { status: 400 });
    const currentUser = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true, phoneVerifiedAt: true } });
    if (currentUser?.phone === phone && currentUser.phoneVerifiedAt) return Response.json({ success: true, alreadyVerified: true });
    const identifierHash = hashAuthValue(user.id, "phone-verification");
    const current = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const now = new Date();
    if (current?.lockedUntil && current.lockedUntil > now) return Response.json({ error: "Phone verification is temporarily locked." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.lockedUntil.getTime() - now.getTime()) / 1000)) } });
    if (current?.resendAfter && current.resendAfter > now) return Response.json({ error: "Please wait before requesting another code." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resendAfter.getTime() - now.getTime()) / 1000)) } });
    const otp = randomOtp();
    const acquired = await prisma.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
      if (challenge?.lockedUntil && challenge.lockedUntil > now) return false;
      if (challenge?.resendAfter && challenge.resendAfter > now) return false;
      const resetAfterExpiredLock = challenge?.lockedUntil && challenge.lockedUntil <= now;
      await tx.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } },
        create: { userId: user.id, identifierHash, type: "PHONE_VERIFICATION", purpose: phone, otpHash: hashAuthValue(otp, "otp"), otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), failedAttempts: 0, resendAfter: new Date(now.getTime() + 60_000) },
        update: { purpose: phone, otpHash: hashAuthValue(otp, "otp"), otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), ...(resetAfterExpiredLock && { failedAttempts: 0, lockedUntil: null }), verifiedAt: null, consumedAt: null, resendAfter: new Date(now.getTime() + 60_000) },
      });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!acquired) return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 429 });
    try {
      await deliverOtp(phone, "sms", otp);
    } catch {
      await prisma.authChallenge.updateMany({ where: { identifierHash, type: "PHONE_VERIFICATION", purpose: phone }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
      return Response.json({ error: "Phone verification code could not be sent." }, { status: 503 });
    }
    await writeSecurityEvent({ userId: user.id, eventType: "OTP_REQUESTED", ip: requestIp(request.headers), details: { purpose: "phone_verification" } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60 });
  } catch {
    console.error("[AUTH_PHONE_REQUEST] Phone verification request failed");
    return Response.json({ error: "Phone verification could not be started" }, { status: 400 });
  }
}
