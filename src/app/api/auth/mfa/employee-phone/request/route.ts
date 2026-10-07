import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { deliverOtp, enforceRateLimits, ensureSameOrigin, getOtpRequestBlock, hashAuthValue, isOtpDeliveryReady, normalizeIdentifier, randomOtp, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { canRequestEmployeeEnrollmentOtp } from "@/lib/auth-session-policy";

const schema = z.object({ phone: z.string().min(8).max(24) }).strict();

function normalizeBangladeshPhone(input: string) {
  const value = normalizeIdentifier(input);
  if (/^01[3-9]\d{8}$/.test(value)) return `+88${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  return value;
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!env.GREENWEB_SMS_TOKEN || !isOtpDeliveryReady("sms")) {
      return Response.json({ error: "Phone verification is temporarily unavailable." }, { status: 503 });
    }
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Enter the invited mobile number." }, { status: 400 });
    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) return Response.json({ error: "Enter a valid Bangladeshi mobile number." }, { status: 400 });

    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-phone-bootstrap:${hashAuthValue(phone, "account")}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `employee-phone-bootstrap-ip:${hashAuthValue(ip, "ip")}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Phone verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const employee = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, role: true, phoneVerifiedAt: true, passwordHash: true, orgId: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    });
    const isInvitedOrgAdmin = employee?.role === "ORG_ADMIN" && employee.passwordHash === null && employee.phoneVerifiedAt === null;
    if (!employee || (employee.role !== "ORG_USER" && !isInvitedOrgAdmin) || !canRequestEmployeeEnrollmentOtp({ role: employee.role, phoneVerifiedAt: employee.phoneVerifiedAt, passwordHash: employee.passwordHash, hasActivePasskey: employee.webAuthnCredentials.length > 0, organizationActive: Boolean(employee.orgId) && !employee.org?.deletedAt })) {
      await writeSecurityEvent({ userId: employee && (employee.role === "ORG_USER" || isInvitedOrgAdmin) ? employee.id : null, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { flow: "phone_only_account_bootstrap_rejected" } });
      return Response.json({ error: "If this employee account is eligible, a code will be sent." }, { status: 400 });
    }

    const identifierHash = hashAuthValue(phone, "employee-phone-bootstrap");
    const now = new Date();
    const current = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const blocked = getOtpRequestBlock(current, now);
    if (blocked) return Response.json({ error: blocked.reason === "locked" ? "Verification is temporarily locked." : "Please wait before requesting another code.", retryAfterSeconds: blocked.retryAfterSeconds }, { status: 429, headers: { "Retry-After": String(blocked.retryAfterSeconds) } });

    const otp = randomOtp();
    const otpHash = hashAuthValue(otp, "otp");
    const acquired = await prisma.$transaction(async (tx) => {
      const challenge = await tx.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
      const transactionBlock = getOtpRequestBlock(challenge, now);
      if (transactionBlock) return false;
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
    await writeSecurityEvent({ userId: employee.id, eventType: "OTP_REQUESTED", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "phone_only_account_bootstrap" } });
    return Response.json({ success: true, expiresInSeconds: 300, resendInSeconds: 60, targetRole: employee.role, message: "Verification code sent." });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_EMPLOYEE_PHONE_BOOTSTRAP] Request failed");
    return Response.json({ error: "Phone verification could not be started." }, { status: 400 });
  }
}
