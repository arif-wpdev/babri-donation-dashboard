import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, getPreAuthUser, getTrustedDeviceCredential, hashAuthValue, isCredentialTrustedForUser, isMfaConfigurationReady, isPasskeyChallengeUsable, makeAuthenticator, requestIp, webAuthnConfiguration, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Passkey sign-in is unavailable" }, { status: 503 });
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your password again." }, { status: 401 });
    if (!preAuth.preAuth.passkeyOnly) return Response.json({ error: "Passkey authentication was not requested for this sign-in." }, { status: 403 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `passkey-verify-user:${preAuth.user.id}`, limit: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
      { key: `passkey-verify-ip:${ip}`, limit: 30, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Passkey sign-in is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null;
    if (!body?.response?.id || body.response.id.length > 4096) return Response.json({ error: "Invalid passkey response" }, { status: 400 });
    const challengeKey = hashAuthValue(preAuth.preAuth.tokenHash, "passkey-auth");
    const trustedDevice = await getTrustedDeviceCredential(preAuth.user.id);
    if (!trustedDevice) return Response.json({ error: "This device is not trusted. Use the OTP flow instead." }, { status: 403 });
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash: challengeKey, type: "PASSKEY_AUTHENTICATION" } } });
    const now = new Date();
    if (!isPasskeyChallengeUsable(challenge, preAuth.user.id, now) || challenge?.purpose !== trustedDevice.credentialId) return Response.json({ error: "Passkey request expired" }, { status: 400 });
    if (!challenge?.challenge) return Response.json({ error: "Passkey request expired" }, { status: 400 });
    const activeChallenge = challenge.challenge;
    const credential = await prisma.webAuthnCredential.findUnique({ where: { credentialId: body.response.id } });
    if (!credential || !isCredentialTrustedForUser({
      userId: preAuth.user.id,
      credentialId: body.response.id,
      credentialUserId: credential.userId,
      trustedCredentialId: trustedDevice.credential.credentialId,
      credentialRevokedAt: credential.revokedAt,
      trustedDeviceRevokedAt: trustedDevice.revokedAt,
    }) || trustedDevice.credential.revokedAt || trustedDevice.credential.userId !== preAuth.user.id || trustedDevice.credential.credentialId !== trustedDevice.credentialId) return Response.json({ error: "This passkey is not available for this device." }, { status: 401 });
    const { origin, rpID } = webAuthnConfiguration(request);
    const verification = await verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: activeChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      authenticator: makeAuthenticator(credential),
    });
    if (!verification.verified) return Response.json({ error: "Passkey verification failed" }, { status: 401 });
    if (!verification.authenticationInfo.userVerified || verification.authenticationInfo.rpID !== rpID || verification.authenticationInfo.origin !== origin) return Response.json({ error: "Passkey verification failed" }, { status: 401 });
    if (Buffer.from(verification.authenticationInfo.credentialID).toString("base64url") !== credential.credentialId) return Response.json({ error: "Passkey verification failed" }, { status: 401 });
    const counter = BigInt(verification.authenticationInfo.newCounter);
    const ticket = randomBytes(32).toString("base64url");
    await prisma.$transaction(async (tx) => {
      const currentPreAuth = await tx.loginPreAuth.findUnique({ where: { id: preAuth.preAuth.id }, select: { userId: true, passkeyOnly: true, deliveryChannel: true, tokenHash: true, expiresAt: true, consumedAt: true } });
      if (!currentPreAuth || currentPreAuth.userId !== preAuth.user.id || !currentPreAuth.passkeyOnly || currentPreAuth.deliveryChannel !== "sms" || currentPreAuth.tokenHash !== preAuth.preAuth.tokenHash || currentPreAuth.consumedAt || currentPreAuth.expiresAt <= now) throw new Error("Pre-authentication state changed");
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, userId: preAuth.user.id, purpose: credential.credentialId, challenge: activeChallenge, consumedAt: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) throw new Error("Challenge already consumed");
      const currentCredential = await tx.webAuthnCredential.findUnique({ where: { id: credential.id }, select: { userId: true, revokedAt: true, counter: true } });
      if (!currentCredential || currentCredential.userId !== preAuth.user.id || currentCredential.revokedAt || currentCredential.counter !== credential.counter) throw new Error("Credential changed during verification");
      const credentialUpdated = await tx.webAuthnCredential.updateMany({ where: { id: credential.id, revokedAt: null, counter: credential.counter }, data: { counter, lastUsedAt: now, deviceType: verification.authenticationInfo.credentialDeviceType, backedUp: verification.authenticationInfo.credentialBackedUp } });
      if (credentialUpdated.count !== 1) throw new Error("Credential changed during verification");
      const deviceUpdated = await tx.trustedDevice.updateMany({ where: { id: trustedDevice.id, userId: preAuth.user.id, credentialId: credential.credentialId, revokedAt: null }, data: { lastUsedAt: now } });
      if (deviceUpdated.count !== 1) throw new Error("Trusted device was revoked during verification");
      const preAuthConsumed = await tx.loginPreAuth.updateMany({ where: { id: preAuth.preAuth.id, consumedAt: null, expiresAt: { gt: now }, passkeyOnly: true }, data: { consumedAt: now } });
      if (preAuthConsumed.count !== 1) throw new Error("Pre-authentication already consumed");
      await tx.loginTicket.create({ data: { userId: preAuth.user.id, preauthId: preAuth.preAuth.id, tokenHash: createHash("sha256").update(ticket).digest("hex"), expiresAt: new Date(now.getTime() + 2 * 60_000) } });
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    await writeSecurityEvent({ userId: preAuth.user.id, eventType: "PASSKEY_LOGIN_SUCCESS", ip, userAgent: request.headers.get("user-agent"), details: { credentialDeviceType: verification.authenticationInfo.credentialDeviceType, backedUp: verification.authenticationInfo.credentialBackedUp } });
    return Response.json({ success: true, loginTicket: ticket, expiresInSeconds: 120 });
  } catch {
    const preAuth = await getPreAuthUser().catch(() => null);
    if (preAuth) {
      await writeSecurityEvent({ userId: preAuth.user.id, eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { action: "passkey_authentication_failure" } });
    }
    console.error("[AUTH_PASSKEY_VERIFY] Passkey authentication failed");
    return Response.json({ error: "Passkey verification failed or request expired" }, { status: 401 });
  }
}
