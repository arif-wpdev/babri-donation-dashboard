import { generateRegistrationOptions } from "@simplewebauthn/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isWebAuthnConfigurationReady, requestIp, webAuthnConfiguration } from "@/lib/auth-security";
import { employeePasskeySetupCookieName } from "@/lib/employee-enrollment";
import { isPhonePasswordlessFirstPasskeyEligible } from "@/lib/auth-session-policy";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isWebAuthnConfigurationReady(request)) return Response.json({ error: "Passkey setup is temporarily unavailable." }, { status: 503 });
    const token = (await cookies()).get(employeePasskeySetupCookieName)?.value;
    if (!token) return Response.json({ error: "Phone verification expired. Request a new code." }, { status: 401 });
    const setupTokenHash = hashAuthValue(token, "employee-passkey-enrollment");
    const enrollment = await prisma.loginPreAuth.findUnique({
      where: { tokenHash: setupTokenHash },
      include: {
        user: {
          select: {
            id: true,
            role: true,
            phone: true,
            phoneVerifiedAt: true,
            passwordHash: true,
            orgId: true,
            org: { select: { deletedAt: true } },
            webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    const now = new Date();
    if (!enrollment || !isPhonePasswordlessFirstPasskeyEligible({ role: enrollment.user.role, phoneVerifiedAt: enrollment.user.phoneVerifiedAt, passwordHash: enrollment.user.passwordHash, organizationActive: Boolean(enrollment.user.orgId) && !enrollment.user.org?.deletedAt, hasActivePasskey: enrollment.user.webAuthnCredentials.length > 0, enrollmentMarker: enrollment.deliveryChannel, passkeyOnly: enrollment.passkeyOnly, enrollmentConsumedAt: enrollment.consumedAt, enrollmentExpiresAt: enrollment.expiresAt, now }) || !enrollment.user.phone || !enrollment.user.orgId) return Response.json({ error: "Phone verification expired. Request a new code." }, { status: 401 });
    (await cookies()).set(employeePasskeySetupCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: Math.max(1, Math.floor((enrollment.expiresAt.getTime() - now.getTime()) / 1000)) });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-passkey-enroll:${enrollment.user.id}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `employee-passkey-enroll-ip:${ip}`, limit: 15, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Passkey setup is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const { rpID, rpName } = webAuthnConfiguration(request);
    const existing = await prisma.webAuthnCredential.findMany({ where: { userId: enrollment.user.id, revokedAt: null }, select: { credentialId: true, transports: true } });
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: enrollment.user.id,
      userName: enrollment.user.phone,
      userDisplayName: enrollment.user.phone,
      attestationType: "none",
      timeout: 60_000,
      excludeCredentials: existing.map((credential) => ({ id: Buffer.from(credential.credentialId, "base64url"), type: "public-key", transports: credential.transports as AuthenticatorTransport[] })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
    });
    const identifierHash = hashAuthValue(enrollment.id, "employee-first-passkey-registration");
    await prisma.authChallenge.upsert({
      where: { identifierHash_type: { identifierHash, type: "PASSKEY_REGISTRATION" } },
      create: { userId: enrollment.user.id, identifierHash, type: "PASSKEY_REGISTRATION", purpose: enrollment.id, challenge: options.challenge, otpExpiresAt: new Date(now.getTime() + 60_000), ipHash: hashAuthValue(ip, "ip") },
      update: { userId: enrollment.user.id, purpose: enrollment.id, challenge: options.challenge, otpExpiresAt: new Date(now.getTime() + 60_000), consumedAt: null, ipHash: hashAuthValue(ip, "ip") },
    });
    return Response.json(options);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_EMPLOYEE_PASSKEY_OPTIONS] Could not create first-passkey challenge");
    return Response.json({ error: "Passkey setup could not be started." }, { status: 400 });
  }
}