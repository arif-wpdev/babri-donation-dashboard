import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { deliverOtp, enforceRateLimits, ensureSameOrigin, hashAuthValue, isOtpDeliveryReady, normalizeIdentifier, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { canBootstrapEmployeePhone } from "@/lib/auth-session-policy";

const schema = z.object({ phone: z.string().min(8).max(24), password: z.string().min(1).max(256) });
function normalizeBangladeshPhone(input: string) {
  const value = normalizeIdentifier(input);
  if (/^01[3-9]\d{8}$/.test(value)) return `+88${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  return value;
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!env.GREENWEB_SMS_TOKEN || !isOtpDeliveryReady("sms")) return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 503 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter the invited phone number and password." }, { status: 400 });
    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) return Response.json({ error: "Enter a valid Bangladeshi mobile number." }, { status: 400 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-phone-bootstrap:${hashAuthValue(phone, "account")}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `employee-phone-bootstrap-ip:${hashAuthValue(ip, "ip")}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Phone verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const employee = await prisma.user.findUnique({ where: { phone }, select: { id: true, name: true, role: true, phone: true, phoneVerifiedAt: true, passwordHash: true } });
    const passwordValid = employee?.passwordHash
      ? await bcrypt.compare(parsed.data.password, employee.passwordHash)
      : env.AUTH_DUMMY_PASSWORD_HASH && /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(env.AUTH_DUMMY_PASSWORD_HASH)
        ? await bcrypt.compare(parsed.data.password, env.AUTH_DUMMY_PASSWORD_HASH)
        : false;
    if (!employee || !canBootstrapEmployeePhone(employee) || !passwordValid) {
      await writeSecurityEvent({ userId: employee?.role === "ORG_USER" ? employee.id : null, eventType: "PASSWORD_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { flow: "employee_phone_bootstrap" } });
      return Response.json({ error: "If this employee account is eligible, a code will be sent." }, { status: 400 });
    }

    const identifierHash = hashAuthValue(employee.id, "employee-phone-bootstrap");
    const now = new Date();
    const current = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    if (current?.lockedUntil && current.lockedUntil > now) return Response.json({ error: "Verification is temporarily locked." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.lockedUntil.getTime() - now.getTime()) / 1000)) } });
    if (current?.resendAfter && current.resendAfter > now) return Response.json({ error: "Please wait before requesting another code." }, { status: 429, headers: { "Retry-After": String(Math.ceil((current.resendAfter.getTime() - now.getTime()) / 1000)) } });

    const otp = randomOtp();
    const otpHash = hashAuthValue(otp, "otp");
    const acquired = await prisma.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
      if (challenge?.lockedUntil && challenge.lockedUntil > now) return false;
      if (challenge?.resendAfter && challenge.resendAfter > now) return false;
      await tx.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } },
        create: { userId: employee.id, identifierHash, type: "PHONE_VERIFICATION", purpose: phone, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, deliveryChannel: "sms", ipHash: hashAuthValue(ip, "ip") },
        update: { userId: employee.id, purpose: phone, otpHash, otpCreatedAt: now, otpExpiresAt: new Date(now.getTime() + 5 * 60_000), resendAfter: new Date(now.getTime() + 60_000), failedAttempts: 0, lockedUntil: null, consumedAt: null, verifiedAt: null, deliveryChannel: "sms", ipHash: hashAuthValue(ip, "ip") },
      });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!acquired) return Response.json({ error: "Please wait before requesting another code." }, { status: 429 });

    try {
      await deliverOtp(phone, "sms", otp);
    } catch {
      await prisma.authChallenge.updateMany({ where: { identifierHash, type: "PHONE_VERIFICATION", purpose: phone, otpHash }, data: { otpHash: null, otpExpiresAt: now, resendAfter: now } });
      return Response.json({ error: "SMS could not be delivered. Try again later." }, { status: 503 });
    }
    await writeSecurityEvent({ userId: employee.id, eventType: "OTP_REQUESTED", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "employee_phone_bootstrap" } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60, message: "Verification code sent." });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_EMPLOYEE_PHONE_BOOTSTRAP] Request failed");
    return Response.json({ error: "Phone verification could not be started." }, { status: 400 });
  }
}
