import { generateRegistrationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isMfaConfigurationReady, requestIp, webAuthnConfiguration, writeSecurityEvent } from "@/lib/auth-security";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Passkey registration is unavailable" }, { status: 503 });
    const user = await requireAuth();
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `passkey-register-user:${user.id}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `passkey-register-ip:${ip}`, limit: 15, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Passkey registration is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const displayName = user.name?.trim() || user.email || "Dashboard user";
    const { rpID, rpName } = webAuthnConfiguration(request);
    const existing = await prisma.webAuthnCredential.findMany({ where: { userId: user.id, revokedAt: null }, select: { credentialId: true, transports: true } });
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: user.id,
      userName: user.email || user.id,
      userDisplayName: displayName,
      attestationType: "none",
      timeout: 60_000,
      excludeCredentials: existing.map((credential) => ({ id: Buffer.from(credential.credentialId, "base64url"), type: "public-key", transports: credential.transports as AuthenticatorTransport[] })),
      authenticatorSelection: { residentKey: "preferred", userVerification: "required", authenticatorAttachment: "platform" },
    });
    const identifierHash = hashAuthValue(user.id, "passkey-registration");
    await prisma.authChallenge.upsert({
      where: { identifierHash_type: { identifierHash, type: "PASSKEY_REGISTRATION" } },
      create: { userId: user.id, identifierHash, type: "PASSKEY_REGISTRATION", challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 5 * 60_000), ipHash: hashAuthValue(ip, "ip") },
      update: { challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 5 * 60_000), consumedAt: null, ipHash: hashAuthValue(ip, "ip") },
    });
    await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { action: "passkey_registration_started" } });
    return Response.json(options);
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[AUTH_PASSKEY_REGISTER_OPTIONS] Could not create registration challenge");
    return Response.json({ error: "Passkey registration could not be started" }, { status: 400 });
  }
}
