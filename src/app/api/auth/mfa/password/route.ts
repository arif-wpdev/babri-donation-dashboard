import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { clearPreAuth, ensureSameOrigin, enforceRateLimits, getTrustedDeviceCredentialForLogin, hashAuthValue, isMfaConfigurationReady, isOtpDeliveryReady, normalizeIdentifier, prefersMobileAuthFlow, requestIp, writeSecurityEvent, issuePreAuth, webAuthnConfiguration } from "@/lib/auth-security";
import { canLoginWithPassword, canMigrateOrgAdminToPasswordless, chooseEmployeeLoginFactor, isPhoneOnlyPasswordlessRole } from "@/lib/auth-session-policy";

const bodySchema = z.object({
  identifier: z.string().min(8).max(24),
  password: z.string().max(256).optional(),
}).strict();

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Invalid sign-in details" }, { status: 400 });
    const identifier = normalizeIdentifier(parsed.data.identifier);
    if (!/^\+[1-9]\d{7,14}$/.test(identifier)) return Response.json({ error: "Enter a valid phone number." }, { status: 400 });

    const ip = requestIp(request.headers);
    const ipHash = hashAuthValue(ip, "ip");
    const rate = await enforceRateLimits([
      { key: `password-account:${hashAuthValue(identifier, "account")}`, limit: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
      { key: `password-ip:${hashAuthValue(ip, "ip")}`, limit: 40, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Sign-in is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const user = await prisma.user.findFirst({
      where: { phone: identifier, phoneVerifiedAt: { not: null }, OR: [{ orgId: null }, { org: { deletedAt: null } }] },
      select: { id: true, role: true, phone: true, phoneVerifiedAt: true, passwordHash: true, orgId: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    });
    const isPhoneOnlyAccount = Boolean(user && isPhoneOnlyPasswordlessRole(user.role) && user.passwordHash === null);
    const requiresPassword = Boolean(user && (!isPhoneOnlyPasswordlessRole(user.role) || canLoginWithPassword({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt })));
    const password = parsed.data.password;
    const dummyHash = env.AUTH_DUMMY_PASSWORD_HASH && /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(env.AUTH_DUMMY_PASSWORD_HASH)
      ? env.AUTH_DUMMY_PASSWORD_HASH
      : undefined;
    const validAdminPassword = user && requiresPassword && user.passwordHash && password
      ? await bcrypt.compare(password, user.passwordHash)
      : dummyHash && password ? await bcrypt.compare(password, dummyHash) : false;
    if (!user || (requiresPassword && (!user.passwordHash || !validAdminPassword)) || (!isPhoneOnlyAccount && !requiresPassword)) {
      await writeSecurityEvent({ userId: user?.id, eventType: "PASSWORD_FAILURE", ip, userAgent: request.headers.get("user-agent") });
      return Response.json({ error: "Invalid sign-in details" }, { status: 401 });
    }
    if (!isMfaConfigurationReady()) return Response.json({ error: "Sign-in is temporarily unavailable. Contact an administrator." }, { status: 503 });

    const organizationActive = user.role === "SUPER_ADMIN" || (Boolean(user.orgId) && !user.org?.deletedAt);
    if (!organizationActive || (isPhoneOnlyAccount && (!user.phone || !user.phoneVerifiedAt))) {
      return Response.json({ error: "Invalid sign-in details" }, { status: 401 });
    }
    const destination = user.phone && user.phoneVerifiedAt ? { channel: "sms" as const, destination: user.phone } : null;
    if (!destination || !isOtpDeliveryReady(destination.channel)) return Response.json({ error: "Phone verification is temporarily unavailable. Contact an administrator." }, { status: 503 });

    const trustedDevice = await getTrustedDeviceCredentialForLogin(user.id);
    const factor = chooseEmployeeLoginFactor({ role: user.role, phoneVerifiedAt: user.phoneVerifiedAt, organizationActive, hasTrustedActivePasskey: Boolean(trustedDevice), mobile: prefersMobileAuthFlow(request.headers) });
    const usePasskey = factor === "passkey" || (factor === "admin" && Boolean(trustedDevice) && prefersMobileAuthFlow(request.headers));
    const identifierHash = hashAuthValue(user.id, "otp-identity");
    const otpLock = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "OTP" } }, select: { lockedUntil: true } });
    if (otpLock?.lockedUntil && otpLock.lockedUntil > new Date() && !usePasskey) {
      return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil((otpLock.lockedUntil.getTime() - Date.now()) / 1000)) } });
    }

    await clearPreAuth();
    const preAuth = await issuePreAuth(user.id, destination.channel, usePasskey);
    await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { step: "factor_selection", factor: usePasskey ? "passkey" : "sms_otp" } });

    if (usePasskey && trustedDevice) {
      const { rpID } = webAuthnConfiguration(request);
      const options = await generateAuthenticationOptions({
        rpID,
        timeout: 60_000,
        userVerification: "required",
        allowCredentials: [{ id: Buffer.from(trustedDevice.credential.credentialId, "base64url"), type: "public-key", transports: trustedDevice.credential.transports as AuthenticatorTransport[] }],
      });
      await prisma.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash: hashAuthValue(preAuth.tokenHash, "passkey-auth"), type: "PASSKEY_AUTHENTICATION" } },
        create: { userId: user.id, identifierHash: hashAuthValue(preAuth.tokenHash, "passkey-auth"), type: "PASSKEY_AUTHENTICATION", challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), ipHash },
        update: { userId: user.id, challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), consumedAt: null, ipHash },
      });
      const needsPasswordlessMigration = user.role === "ORG_ADMIN" && isMfaConfigurationReady() && canMigrateOrgAdminToPasswordless({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt, organizationActive, hasActivePasskey: user.webAuthnCredentials.length > 0, suppliedPasswordValid: requiresPassword, authenticationReady: isMfaConfigurationReady() });
      return Response.json({ success: true, next: "passkey", options, identifier: `••••${identifier.slice(-4)}`, channel: destination.channel, employee: isPhoneOnlyAccount, role: user.role, needsPasswordlessMigration });
    }
    const needsPasswordlessMigration = user.role === "ORG_ADMIN" && isMfaConfigurationReady() && canMigrateOrgAdminToPasswordless({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt, organizationActive, hasActivePasskey: user.webAuthnCredentials.length > 0, suppliedPasswordValid: requiresPassword, authenticationReady: isMfaConfigurationReady() });
    return Response.json({ success: true, next: "otp", identifier: `••••${identifier.slice(-4)}`, channel: destination.channel, employee: isPhoneOnlyAccount, role: user.role, needsPasswordlessMigration });
  } catch (error) {
    console.error("[AUTH_PASSWORD] Authentication step failed");
    return Response.json({ error: error instanceof Error && error.message === "Invalid request origin" ? "Invalid request" : "Sign-in could not be started" }, { status: 400 });
  }
}