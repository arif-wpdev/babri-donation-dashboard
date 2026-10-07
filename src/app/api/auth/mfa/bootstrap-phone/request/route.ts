import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { deliverOtp, enforceRateLimits, ensureSameOrigin, hashAuthValue, isOtpDeliveryReady, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { canBootstrapPasswordAdminPhone } from "@/lib/auth-session-policy";

const schema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256), phone: z.string().regex(/^\+[1-9]\d{7,14}$/) });
const genericResponse = { success: true, message: "If eligible, a verification code will be sent." };

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!env.GREENWEB_SMS_TOKEN || !isOtpDeliveryReady("sms")) return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 503 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json(genericResponse);
    const email = parsed.data.email.trim().toLowerCase();
    const phone = parsed.data.phone;
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `admin-phone-bootstrap-account:${hashAuthValue(email, "account")}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `admin-phone-bootstrap-ip:${hashAuthValue(ip, "ip")}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json(genericResponse);

    const admin = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, role: true, orgId: true, org: { select: { deletedAt: true } }, phone: true, phoneVerifiedAt: true, passwordHash: true } });
    const dummyPasswordHash = env.AUTH_DUMMY_PASSWORD_HASH && /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(env.AUTH_DUMMY_PASSWORD_HASH)
      ? env.AUTH_DUMMY_PASSWORD_HASH
      : undefined;
    const validPassword = admin?.passwordHash
      ? await bcrypt.compare(parsed.data.password, admin.passwordHash)
      : dummyPasswordHash
        ? await bcrypt.compare(parsed.data.password, dummyPasswordHash)
        : false;
    const organizationActive = admin?.role === "SUPER_ADMIN" || (Boolean(admin?.orgId) && !admin?.org?.deletedAt);
    if (!admin || !canBootstrapPasswordAdminPhone({ role: admin.role, passwordHash: admin.passwordHash, phoneVerifiedAt: admin.phoneVerifiedAt, organizationActive: Boolean(organizationActive) }) || !validPassword) {
      await writeSecurityEvent({ userId: admin && (admin.role === "SUPER_ADMIN" || admin.role === "ORG_ADMIN") ? admin.id : null, eventType: "PASSWORD_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { flow: "admin_phone_bootstrap" } });
      return Response.json(genericResponse);
    }

    const phoneOwner = await prisma.user.findFirst({ where: { phone, NOT: { id: admin.id } }, select: { id: true } });
    if (phoneOwner) return Response.json(genericResponse);

    const identifierHash = hashAuthValue(admin.id, "admin-phone-bootstrap");
    const now = new Date();
    const existing = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const lockedUntil = existing?.lockedUntil;
    const resendAfter = existing?.resendAfter;
    if (lockedUntil && lockedUntil > now) return Response.json(genericResponse);
    if (resendAfter && resendAfter > now) return Response.json(genericResponse);

    const otp = randomOtp();
    const otpHash = hashAuthValue(otp, "otp");
    const acquired = await prisma.$transaction(async (tx) => {
      const current = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
      if (current?.lockedUntil && current.lockedUntil > now) return false;
      if (current?.resendAfter && current.resendAfter > now) return false;
      const phoneInUse = await tx.user.findFirst({ where: { phone, NOT: { id: admin.id } }, select: { id: true } });
      if (phoneInUse) return false;
      await tx.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } },
        create: { userId: admin.id, identifierHash, type: "PHONE_VERIFICATION", purpose: phone, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, deliveryChannel: "sms", ipHash: hashAuthValue(ip, "ip") },
        update: { userId: admin.id, purpose: phone, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, lockedUntil: null, consumedAt: null, verifiedAt: null, deliveryChannel: "sms", ipHash: hashAuthValue(ip, "ip") },
      });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!acquired) return Response.json(genericResponse);

    try {
      await deliverOtp(phone, "sms", otp);
    } catch {
      await prisma.authChallenge.updateMany({ where: { identifierHash, type: "PHONE_VERIFICATION", purpose: phone, otpHash }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
      return Response.json({ error: "SMS could not be delivered. Try again later." }, { status: 503 });
    }
    await writeSecurityEvent({ userId: admin.id, eventType: "OTP_REQUESTED", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "admin_phone_bootstrap" } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60 });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_SUPERADMIN_PHONE_BOOTSTRAP] Request failed");
    return Response.json({ error: "Phone verification could not be started." }, { status: 400 });
  }
}
