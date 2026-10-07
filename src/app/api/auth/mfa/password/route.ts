import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { clearPreAuth, ensureSameOrigin, enforceRateLimits, getTrustedDeviceCredential, hashAuthValue, isMfaConfigurationReady, isOtpDeliveryReady, normalizeIdentifier, prefersMobileAuthFlow, requestIp, writeSecurityEvent, issuePreAuth, webAuthnConfiguration } from "@/lib/auth-security";

const bodySchema = z.object({ identifier: z.string().min(8).max(24), password: z.string().min(12).max(256) });

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const parsed = bodySchema.safeParse(await request.json());
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
      where: { phone: identifier, phoneVerifiedAt: { not: null }, org: { deletedAt: null } },
      select: { id: true, email: true, phone: true, phoneVerifiedAt: true, passwordHash: true },
    });
    const accountOtpLock = user ? await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash: hashAuthValue(user.id, "otp-identity"), type: "OTP" } }, select: { lockedUntil: true } }) : null;
    // Perform a password hash comparison for unknown accounts too, minimizing response-time account enumeration.
    const dummyPasswordHash = env.AUTH_DUMMY_PASSWORD_HASH && /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(env.AUTH_DUMMY_PASSWORD_HASH)
      ? env.AUTH_DUMMY_PASSWORD_HASH
      : undefined;
    const valid = user?.passwordHash
      ? await bcrypt.compare(parsed.data.password, user.passwordHash)
      : dummyPasswordHash ? await bcrypt.compare(parsed.data.password, dummyPasswordHash) : false;
    if (!user || !user.passwordHash || !valid) {
      await writeSecurityEvent({ userId: user?.id, eventType: "PASSWORD_FAILURE", ip, userAgent: request.headers.get("user-agent") });
      return Response.json({ error: "Invalid sign-in details" }, { status: 401 });
    }
    if (!isMfaConfigurationReady()) return Response.json({ error: "Sign-in is temporarily unavailable. Contact an administrator." }, { status: 503 });

    const destination = user.phone && user.phoneVerifiedAt ? { channel: "sms" as const, destination: user.phone } : null;
    if (!destination) return Response.json({ error: "Invalid sign-in details" }, { status: 401 });
    if (!isOtpDeliveryReady("sms")) return Response.json({ error: "Phone verification is temporarily unavailable. Contact an administrator." }, { status: 503 });
    await clearPreAuth();
    const identifierHash = hashAuthValue(user.id, "otp-identity");
    const trustedDevice = await getTrustedDeviceCredential(user.id);
    if (trustedDevice) {
      await prisma.trustedDevice.update({ where: { id: trustedDevice.id }, data: { lastUsedAt: new Date() } });
    }
    if (trustedDevice) {
      await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { action: "trusted_device_recognized", factor: "registered_passkey" } });
    }
    const usePasskey = Boolean(trustedDevice) && prefersMobileAuthFlow(request.headers);
    if (accountOtpLock?.lockedUntil && accountOtpLock.lockedUntil > new Date()) {
      await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip });
      if (!usePasskey) return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil((accountOtpLock.lockedUntil.getTime() - Date.now()) / 1000)) } });
    }
    const next = usePasskey ? "passkey" : "otp";
    const existingLock = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "OTP" } }, select: { lockedUntil: true } });
    if (existingLock?.lockedUntil && existingLock.lockedUntil > new Date()) {
      await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip });
      if (!usePasskey) return Response.json({ error: "Verification is temporarily unavailable. Try again later." }, { status: 429, headers: { "Retry-After": String(Math.ceil((existingLock.lockedUntil.getTime() - Date.now()) / 1000)) } });
    }
    await issuePreAuth(user.id, destination.channel, usePasskey);
    await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { step: "password_verified" } });
    if (usePasskey && trustedDevice) {
      const { rpID } = webAuthnConfiguration(request);
      if (destination.channel === "sms" && !user.phoneVerifiedAt) return Response.json({ error: "Invalid sign-in details" }, { status: 401 });
      const options = await generateAuthenticationOptions({
        rpID,
        timeout: 60_000,
        userVerification: "required",
        allowCredentials: [{ id: Buffer.from(trustedDevice.credential.credentialId, "base64url"), type: "public-key", transports: trustedDevice.credential.transports as AuthenticatorTransport[] }],
      });
      const preAuth = await prisma.loginPreAuth.findFirst({ where: { userId: user.id, consumedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } });
      if (!preAuth) throw new Error("Sign-in state unavailable");
      const identifierHash = hashAuthValue(preAuth.tokenHash, "passkey-auth");
      await prisma.authChallenge.upsert({
        where: { identifierHash_type: { identifierHash, type: "PASSKEY_AUTHENTICATION" } },
        create: { userId: user.id, identifierHash, type: "PASSKEY_AUTHENTICATION", challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), ipHash },
        update: { challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), consumedAt: null, ipHash },
      });
      return Response.json({ success: true, next, options, identifier: `••••${identifier.slice(-4)}`, channel: destination.channel });
    }
    return Response.json({ success: true, next: "otp", identifier: `••••${identifier.slice(-4)}`, channel: destination.channel });
  } catch (error) {
    console.error("[AUTH_PASSWORD] Authentication step failed");
    return Response.json({ error: error instanceof Error && error.message === "Invalid request origin" ? "Invalid request" : "Sign-in could not be started" }, { status: 400 });
  }
}
