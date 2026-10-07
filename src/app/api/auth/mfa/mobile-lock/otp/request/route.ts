import { prisma } from "@/lib/prisma";
import { deliverOtp, enforceRateLimits, ensureSameOrigin, getOtpRequestBlock, hashAuthValue, isMfaConfigurationReady, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { createMobileLockUnlockPreAuth, getMobileLockContext, getMobileLockState } from "@/lib/mobile-app-lock";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Unlock verification is temporarily unavailable." }, { status: 503 });
    const context = await getMobileLockContext({ allowLockedSession: true });
    if (!context?.phone || !context.phoneVerifiedAt) return Response.json({ error: "Unlock is unavailable for this session." }, { status: 403 });
    if (!(await getMobileLockState())?.locked) return Response.json({ error: "The app is not locked." }, { status: 409 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `mobile-unlock-otp-user:${context.userId}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `mobile-unlock-otp-ip:${hashAuthValue(ip, "ip")}`, limit: 15, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Unlock verification is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const identifierHash = hashAuthValue(context.sessionId, "mobile-app-unlock-otp");
    const now = new Date();
    const current = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const blocked = getOtpRequestBlock(current, now);
    if (blocked) return Response.json({ error: "Please wait before requesting another code.", retryAfterSeconds: blocked.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } });

    const otp = randomOtp();
    const otpHash = hashAuthValue(otp, "otp");
    const preAuth = await createMobileLockUnlockPreAuth({ userId: context.userId, sessionId: context.sessionId });
    await prisma.$transaction(async (tx) => {
      const session = await tx.authSession.findUnique({ where: { id: context.sessionId }, select: { userId: true, lastUsedAt: true, mobileLockEnabled: true, revokedAt: true, expiresAt: true } });
      if (!session || session.userId !== context.userId || !session.mobileLockEnabled || session.revokedAt || session.expiresAt <= now || now.getTime() - session.lastUsedAt.getTime() < 5 * 60_000) throw new Error("Mobile session is no longer locked");
      await tx.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } },
        create: { userId: context.userId, identifierHash, type: "PHONE_VERIFICATION", purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: preAuth.expiresAt, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, deliveryChannel: "mobile-app-unlock", ipHash: hashAuthValue(ip, "ip") },
        update: { userId: context.userId, purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: preAuth.expiresAt, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, lockedUntil: null, consumedAt: null, verifiedAt: null, deliveryChannel: "mobile-app-unlock", ipHash: hashAuthValue(ip, "ip") },
      });
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    try {
      await deliverOtp(context.phone, "sms", otp);
    } catch {
      await prisma.authChallenge.updateMany({ where: { identifierHash, type: "PHONE_VERIFICATION", purpose: context.sessionId, otpHash }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
      return Response.json({ error: "SMS could not be delivered. Try again later." }, { status: 503 });
    }
    await writeSecurityEvent({ userId: context.userId, eventType: "OTP_REQUESTED", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "mobile_app_unlock" } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60, destination: `••••${context.phone.slice(-4)}` });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[MOBILE_LOCK_OTP_REQUEST] Could not send unlock code");
    return Response.json({ error: "Unlock code could not be requested." }, { status: 400 });
  }
}