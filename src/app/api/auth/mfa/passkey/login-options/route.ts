import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, getPreAuthUser, getTrustedDeviceCredential, hashAuthValue, isMfaConfigurationReady, requestIp, webAuthnConfiguration } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Passkey sign-in is unavailable" }, { status: 503 });
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your password again." }, { status: 401 });
    if (!preAuth.preAuth.passkeyOnly) return Response.json({ error: "Passkey authentication was not requested for this sign-in." }, { status: 403 });
    const rate = await enforceRateLimits([
      { key: `passkey-challenge-user:${preAuth.user.id}`, limit: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
      { key: `passkey-challenge-ip:${requestIp(request.headers)}`, limit: 40, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Passkey sign-in is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const { rpID } = webAuthnConfiguration(request);
    const trustedDevice = await getTrustedDeviceCredential(preAuth.user.id);
    if (!trustedDevice) return Response.json({ error: "This device is not trusted. Use the OTP flow instead." }, { status: 403 });
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: [{ id: Buffer.from(trustedDevice.credential.credentialId, "base64url"), type: "public-key", transports: trustedDevice.credential.transports as AuthenticatorTransport[] }],
    });
    const challengeKey = hashAuthValue(preAuth.preAuth.tokenHash, "passkey-auth");
    await prisma.authChallenge.upsert({
      where: { identifierHash_type: { identifierHash: challengeKey, type: "PASSKEY_AUTHENTICATION" } },
      create: { userId: preAuth.user.id, identifierHash: challengeKey, type: "PASSKEY_AUTHENTICATION", challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), ipHash: hashAuthValue(requestIp(request.headers), "ip") },
      update: { challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), consumedAt: null, ipHash: hashAuthValue(requestIp(request.headers), "ip") },
    });
    return Response.json(options);
  } catch {
    console.error("[AUTH_PASSKEY_OPTIONS] Could not create authentication challenge");
    return Response.json({ error: "Passkey sign-in could not be started" }, { status: 400 });
  }
}
