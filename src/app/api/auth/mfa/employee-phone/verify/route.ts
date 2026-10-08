import { z } from "zod";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, nextOtpFailure, normalizeIdentifier, OTP_LOCK_DURATION_MS, OTP_MAX_FAILED_ATTEMPTS, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";
import { randomBytes } from "node:crypto";
import { employeePasskeySetupCookieName } from "@/lib/employee-enrollment";
import { canRequestEmployeeEnrollmentOtp } from "@/lib/auth-session-policy";

const schema = z.object({ phone: z.string().min(8).max(24), otp: z.string().regex(/^\d{6}$/) });
function normalizeBangladeshPhone(input: string) {
  const value = normalizeIdentifier(input);
  if (/^01[3-9]\d{8}$/.test(value)) return `+88${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  return value;
}

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid verification details." }, { status: 400 });
    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) return Response.json({ error: "Verification failed." }, { status: 400 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-phone-verify:${hashAuthValue(phone, "account")}`, limit: 10, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
      { key: `employee-phone-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 20, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Verification is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const employee = await prisma.user.findUnique({ where: { phone }, select: { id: true, role: true, phone: true, disabledAt: true, phoneVerifiedAt: true, passwordHash: true, orgId: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } } });
    const isInvitedOrgAdmin = employee?.role === "ORG_ADMIN" && employee.passwordHash === null && employee.phoneVerifiedAt === null;
    if (!employee || employee.disabledAt || (employee.role !== "ORG_USER" && !isInvitedOrgAdmin) || !canRequestEmployeeEnrollmentOtp({ role: employee.role, phoneVerifiedAt: employee.phoneVerifiedAt, passwordHash: employee.passwordHash, hasActivePasskey: employee.webAuthnCredentials.length > 0, organizationActive: Boolean(employee.orgId) && !employee.org?.deletedAt })) return Response.json({ error: "Verification failed." }, { status: 400 });

    const identifierHash = hashAuthValue(phone, "employee-phone-bootstrap");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
    const now = new Date();
    if (!challenge?.otpHash || challenge.userId !== employee.id || !challenge.otpExpiresAt || challenge.otpExpiresAt <= now || challenge.consumedAt || challenge.purpose !== phone || (challenge.lockedUntil && challenge.lockedUntil > now) || challenge.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS) return Response.json({ error: "Verification code is invalid or expired." }, { status: 400 });

    if (!verifyOtpHash(challenge.otpHash, parsed.data.otp)) {
      const failure = await prisma.$transaction(async (tx) => {
        const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
        if (!current || current.userId !== employee.id || current.otpHash !== challenge.otpHash || current.purpose !== phone || current.failedAttempts !== challenge.failedAttempts || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now || (current.lockedUntil && current.lockedUntil > now)) return null;
        const next = nextOtpFailure(current.failedAttempts, now, OTP_MAX_FAILED_ATTEMPTS, OTP_LOCK_DURATION_MS);
        const changed = await tx.authChallenge.updateMany({ where: { id: current.id, userId: employee.id, otpHash: challenge.otpHash, purpose: phone, failedAttempts: current.failedAttempts, consumedAt: null, lockedUntil: current.lockedUntil }, data: { failedAttempts: next.attempts, ...(next.lockedUntil && { lockedUntil: next.lockedUntil, otpHash: null }) } });
        return changed.count === 1 ? next : null;
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!failure) return Response.json({ error: "Verification state changed. Request a new code." }, { status: 409 });
      await writeSecurityEvent({ userId: employee.id, eventType: failure.lockedUntil ? "OTP_LOCK" : "OTP_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "employee_phone_bootstrap", attempts: failure.attempts } });
      return Response.json({ error: failure.lockedUntil ? "Verification is locked for 24 hours." : "Incorrect verification code.", attemptsRemaining: Math.max(0, OTP_MAX_FAILED_ATTEMPTS - failure.attempts) }, { status: failure.lockedUntil ? 429 : 400 });
    }

    const setupToken = randomBytes(32).toString("base64url");
    const verified = await prisma.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, userId: employee.id, otpHash: challenge.otpHash, purpose: phone, failedAttempts: { lt: OTP_MAX_FAILED_ATTEMPTS }, consumedAt: null, lockedUntil: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now, verifiedAt: now, otpHash: null } });
      if (claimed.count !== 1) return false;
      const currentEmployee = await tx.user.findUnique({ where: { id: employee.id }, select: { role: true, phone: true, disabledAt: true, phoneVerifiedAt: true, passwordHash: true, orgId: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } } });
      const currentIsInvitedOrgAdmin = currentEmployee?.role === "ORG_ADMIN" && currentEmployee.passwordHash === null && currentEmployee.phoneVerifiedAt === null;
      if (!currentEmployee || currentEmployee.disabledAt || currentEmployee.phone !== phone || currentEmployee.orgId !== employee.orgId || (currentEmployee.role !== "ORG_USER" && !currentIsInvitedOrgAdmin) || !canRequestEmployeeEnrollmentOtp({ role: currentEmployee.role, phoneVerifiedAt: currentEmployee.phoneVerifiedAt, passwordHash: currentEmployee.passwordHash, hasActivePasskey: currentEmployee.webAuthnCredentials.length > 0, organizationActive: Boolean(currentEmployee.orgId) && !currentEmployee.org?.deletedAt })) return false;
      await tx.loginPreAuth.create({ data: { userId: employee.id, tokenHash: hashAuthValue(setupToken, "employee-passkey-enrollment"), expiresAt: new Date(now.getTime() + 10 * 60_000), deliveryChannel: "employee-enrollment", passkeyOnly: true } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 8_000 });
    if (!verified) return Response.json({ error: "Verification expired. Request a new code." }, { status: 409 });
    await writeSecurityEvent({ userId: employee.id, eventType: "PHONE_VERIFICATION", ip, userAgent: request.headers.get("user-agent"), details: { method: "employee_invitation" } });
    const response = Response.json({ success: true, message: "Code accepted. Register a passkey to finish account setup." });
    (await cookies()).set(employeePasskeySetupCookieName, setupToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 10 * 60,
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_EMPLOYEE_PHONE_BOOTSTRAP_VERIFY] Verification failed");
    return Response.json({ error: "Phone verification could not be completed." }, { status: 400 });
  }
}
