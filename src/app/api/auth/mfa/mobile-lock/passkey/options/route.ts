import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isMfaConfigurationReady, requestIp, webAuthnConfiguration } from "@/lib/auth-security";
import { createMobileLockUnlockPreAuth, getMobileLockContext, getMobileLockState } from "@/lib/mobile-app-lock";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Mobile unlock is temporarily unavailable." }, { status: 503 });
    const context = await getMobileLockContext({ allowLockedSession: true });
    if (!context) return Response.json({ error: "Mobile lock is unavailable for this session." }, { status: 403 });
    if (!(await getMobileLockState())?.locked) return Response.json({ error: "The app is not locked." }, { status: 409 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `mobile-unlock-passkey-user:${context.userId}`, limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
      { key: `mobile-unlock-passkey-ip:${hashAuthValue(ip, "ip")}`, limit: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Mobile unlock is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const active = await prisma.webAuthnCredential.findMany({ where: { userId: context.userId, revokedAt: null }, select: { credentialId: true, transports: true } });
    if (!active.length) return Response.json({ error: "No active passkey is available. Use OTP unlock." }, { status: 403 });
    const { rpID } = webAuthnConfiguration(request);
    const options = await generateAuthenticationOptions({
      rpID,
      timeout: 60_000,
      userVerification: "required",
      allowCredentials: active.map((credential) => ({ id: Buffer.from(credential.credentialId, "base64url"), type: "public-key", transports: credential.transports as AuthenticatorTransport[] })),
    });
    const preAuth = await createMobileLockUnlockPreAuth({ userId: context.userId, sessionId: context.sessionId });
    const identifierHash = hashAuthValue(preAuth.tokenHash, "mobile-unlock-passkey");
    await prisma.authChallenge.upsert({
      where: { identifierHash_type: { identifierHash, type: "PASSKEY_AUTHENTICATION" } },
      create: { userId: context.userId, identifierHash, purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: preAuth.expiresAt, type: "PASSKEY_AUTHENTICATION", challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), ipHash: hashAuthValue(ip, "ip") },
      update: { userId: context.userId, purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: preAuth.expiresAt, challenge: options.challenge, otpExpiresAt: new Date(Date.now() + 60_000), consumedAt: null, ipHash: hashAuthValue(ip, "ip") },
    });
    return Response.json(options);
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request." }, { status: 400 });
    console.error("[MOBILE_LOCK_PASSKEY_OPTIONS] Could not create unlock challenge");
    return Response.json({ error: "Passkey unlock could not be started." }, { status: 400 });
  }
}