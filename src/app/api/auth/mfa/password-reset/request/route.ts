import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { deliverOtp, ensureSameOrigin, enforceRateLimits, getOtpRequestBlock, hashAuthValue, normalizeIdentifier, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { clearExpiredOtpLock } from "@/lib/auth-session-policy";

const schema = z.object({ identifier: z.string().min(8).max(32) });

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
    const identifier = normalizeIdentifier(parsed.data.identifier);
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `password-reset-identifier:${hashAuthValue(identifier, "account")}`, limit: 3, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `password-reset-ip:${hashAuthValue(ip, "ip")}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
    if (!/^\+[1-9]\d{7,14}$/.test(identifier)) return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
    const user = await prisma.user.findFirst({
      where: { phone: identifier, phoneVerifiedAt: { not: null }, org: { deletedAt: null } },
      select: { id: true, phone: true },
    });
    if (user) {
      const channel = "sms" as const;
      const destination = user.phone;
      if (destination) {
        const resetIdentifierHash = hashAuthValue(user.id, "password-reset");
        const now = new Date();
        const otp = randomOtp();
        const otpHash = hashAuthValue(otp, "otp");
        const acquired = await prisma.$transaction(async (tx) => {
          const current = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash: resetIdentifierHash, type: "PASSWORD_RESET" } } });
          const blocked = getOtpRequestBlock(current, now);
          if (blocked) return false;
          await tx.authChallenge.upsert({
            where: { identifierHash_type: { identifierHash: resetIdentifierHash, type: "PASSWORD_RESET" } },
            create: { userId: user.id, identifierHash: resetIdentifierHash, type: "PASSWORD_RESET", otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, deliveryChannel: channel },
            update: { otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, lockedUntil: clearExpiredOtpLock(current?.lockedUntil ?? null, now), consumedAt: null, verifiedAt: null, deliveryChannel: channel },
          });
          return true;
        }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
        if (!acquired) return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
        try {
          await deliverOtp(destination, channel, otp);
          await writeSecurityEvent({ userId: user.id, eventType: "PASSWORD_RESET", ip, userAgent: request.headers.get("user-agent"), details: { stage: "requested", channel } });
        } catch {
          await prisma.authChallenge.updateMany({ where: { identifierHash: resetIdentifierHash, type: "PASSWORD_RESET", otpHash }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
        }
      }
    }
    return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
  } catch {
    console.error("[AUTH_PASSWORD_RESET_REQUEST] Reset request failed");
    return Response.json({ success: true, message: "If the account is eligible, a reset code will be sent." });
  }
}
