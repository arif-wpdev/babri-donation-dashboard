import { prisma } from "@/lib/prisma";
import { deliverOtp, ensureSameOrigin, enforceRateLimits, getOtpRequestBlock, getPreAuthUser, hashAuthValue, isMfaConfigurationReady, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Verification is temporarily unavailable." }, { status: 503 });
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your password again." }, { status: 401 });
    if (preAuth.preAuth.passkeyOnly) return Response.json({ error: "This trusted device requires its registered passkey." }, { status: 403 });
    if (preAuth.preAuth.deliveryChannel === "sms" && !preAuth.user.phoneVerifiedAt) return Response.json({ error: "Verification is temporarily unavailable." }, { status: 401 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `otp-request-user:${preAuth.user.id}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `otp-request-ip:${ip}`, limit: 20, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const identifierHash = hashAuthValue(preAuth.user.id, "otp-identity");
    const now = new Date();
    const channel = preAuth.preAuth.deliveryChannel === "sms" ? "sms" as const : null;
    const destination = preAuth.user.phone;
    if (!channel || !destination || !preAuth.user.phoneVerifiedAt) {
      return Response.json({ error: "Verification is temporarily unavailable. Try signing in again." }, { status: 400 });
    }
    const otp = randomOtp();
    const otpHash = hashAuthValue(otp, "otp");
    const expiresAt = new Date(now.getTime() + 5 * 60_000);
    const resendAfter = new Date(now.getTime() + 60_000);
    const acquired = await prisma.$transaction(async (tx) => {
      const current = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "OTP" } } });
      const blocked = getOtpRequestBlock(current, now);
      if (blocked) return { allowed: false as const, retryAfterSeconds: blocked.retryAfterSeconds, locked: blocked.reason === "locked" };
      if (current?.lockedUntil && current.lockedUntil <= now) {
        await tx.authChallenge.update({ where: { id: current.id }, data: { lockedUntil: null, failedAttempts: 0 } });
      }
      await tx.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "OTP" } },
        create: { identifierHash, userId: preAuth.user.id, type: "OTP", otpHash, failedAttempts: 0, otpCreatedAt: now, otpExpiresAt: expiresAt, resendAfter, deliveryChannel: channel, ipHash: hashAuthValue(ip, "ip") },
        update: { userId: preAuth.user.id, otpHash, otpCreatedAt: now, otpExpiresAt: expiresAt, verifiedAt: null, consumedAt: null, resendAfter, deliveryChannel: channel, ipHash: hashAuthValue(ip, "ip"), loginTicketHash: null, loginTicketExpiresAt: null },
      });
      return { allowed: true as const, retryAfterSeconds: 0, locked: false };
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!acquired.allowed) return Response.json({ error: acquired.locked ? "Verification is temporarily unavailable. Try again later." : "Please wait before requesting another code.", retryAfterSeconds: acquired.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(acquired.retryAfterSeconds) } });
    try {
      await deliverOtp(destination, channel, otp);
    } catch {
      await prisma.authChallenge.updateMany({ where: { identifierHash, type: "OTP", otpHash }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
      return Response.json({ error: "Verification code could not be delivered. Try again later." }, { status: 503 });
    }
    await writeSecurityEvent({ userId: preAuth.user.id, eventType: "OTP_REQUESTED", ip, userAgent: request.headers.get("user-agent"), details: { channel } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60, channel });
  } catch {
    console.error("[AUTH_OTP_REQUEST] OTP request failed");
    return Response.json({ error: "Verification code could not be requested" }, { status: 400 });
  }
}
