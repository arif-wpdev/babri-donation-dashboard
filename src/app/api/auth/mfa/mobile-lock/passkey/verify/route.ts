import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isCredentialTrustedForUser, isMfaConfigurationReady, isPasskeyChallengeUsable, isTrustedDeviceRecordUsable, makeAuthenticator, requestIp, webAuthnConfiguration, writeSecurityEvent } from "@/lib/auth-security";
import { getMobileLockContext, getMobileLockState, clearMobileLockUnlockPreAuth, getMobileLockUnlockPreAuth } from "@/lib/mobile-app-lock";
import { canUnlockMobileAppWithPasskey } from "@/lib/auth-session-policy";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Mobile unlock is temporarily unavailable." }, { status: 503 });
    const context = await getMobileLockContext({ allowLockedSession: true });
    const preAuth = context ? await getMobileLockUnlockPreAuth(context.userId) : null;
    if (!context || !preAuth || !(await getMobileLockState())?.locked) return Response.json({ error: "Unlock attempt expired. Try OTP instead." }, { status: 401 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `mobile-unlock-passkey-verify-user:${context.userId}`, limit: 10, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
      { key: `mobile-unlock-passkey-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 30, windowMs: 15 * 60_000, blockMs: 15 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Mobile unlock is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json().catch(() => null) as { response?: AuthenticationResponseJSON } | null;
    if (!body?.response?.id || body.response.id.length > 4096) return Response.json({ error: "Invalid passkey response." }, { status: 400 });
    const identifierHash = hashAuthValue(preAuth.tokenHash, "mobile-unlock-passkey");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PASSKEY_AUTHENTICATION" } } });
    const now = new Date();
    if (!isPasskeyChallengeUsable(challenge, context.userId, now) || challenge?.purpose !== context.sessionId || !challenge.challenge) return Response.json({ error: "Passkey request expired." }, { status: 400 });
    const credential = await prisma.webAuthnCredential.findUnique({ where: { credentialId: body.response.id } });
    const trusted = credential ? await prisma.trustedDevice.findFirst({ where: { userId: context.userId, credentialId: credential.credentialId, revokedAt: null }, include: { credential: true } }) : null;
    if (!credential || !trusted || !isCredentialTrustedForUser({ userId: context.userId, credentialId: credential.credentialId, credentialUserId: credential.userId, trustedCredentialId: trusted.credentialId, credentialRevokedAt: credential.revokedAt, trustedDeviceRevokedAt: trusted.revokedAt }) || !isTrustedDeviceRecordUsable({ exists: true, userId: context.userId, deviceUserId: trusted.userId, credentialId: trusted.credentialId, trustedCredentialId: trusted.credential.credentialId, credentialUserId: trusted.credential.userId, deviceRevokedAt: trusted.revokedAt, credentialRevokedAt: trusted.credential.revokedAt, createdAt: trusted.createdAt, now: new Date() }) || credential.revokedAt) {
      return Response.json({ error: "This passkey is no longer available. Use OTP unlock." }, { status: 401 });
    }
    const { origin, rpID } = webAuthnConfiguration(request);
    const verification = await verifyAuthenticationResponse({ response: body.response, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true, authenticator: makeAuthenticator(credential) });
    if (!verification.verified || !verification.authenticationInfo.userVerified || verification.authenticationInfo.rpID !== rpID || verification.authenticationInfo.origin !== origin || Buffer.from(verification.authenticationInfo.credentialID).toString("base64url") !== credential.credentialId) {
      return Response.json({ error: "Passkey verification failed. Use OTP unlock." }, { status: 401 });
    }

    const unlocked = await prisma.$transaction(async (tx) => {
      const currentSession = await tx.authSession.findUnique({
        where: { id: context.sessionId },
        include: {
          user: {
            select: {
              id: true,
              role: true,
              phoneVerifiedAt: true,
              orgId: true,
              org: { select: { deletedAt: true } },
            },
          },
        },
      });
      if (!currentSession || currentSession.userId !== context.userId || !canUnlockMobileAppWithPasskey({ role: currentSession.user.role, phoneVerifiedAt: currentSession.user.phoneVerifiedAt, organizationActive: Boolean(currentSession.user.orgId) && !currentSession.user.org?.deletedAt, sessionId: context.sessionId, sessionUserId: currentSession.id, sessionMobileLockEnabled: currentSession.mobileLockEnabled, sessionRevokedAt: currentSession.revokedAt, sessionExpiresAt: currentSession.expiresAt, lastUsedAt: currentSession.lastUsedAt, now })) return false;
      const claimedChallenge = await tx.authChallenge.updateMany({ where: { id: challenge.id, userId: context.userId, purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: { gt: now }, challenge: challenge.challenge, consumedAt: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimedChallenge.count !== 1) return false;
      const consumedPreAuth = await tx.loginPreAuth.updateMany({ where: { id: preAuth.id, userId: context.userId, tokenHash: preAuth.tokenHash, deliveryChannel: "mobile-unlock", passkeyOnly: true, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (consumedPreAuth.count !== 1) return false;
      const session = await tx.authSession.updateMany({ where: { id: context.sessionId, userId: context.userId, mobileLockEnabled: true, revokedAt: null, expiresAt: { gt: now }, lastUsedAt: currentSession.lastUsedAt }, data: { lastUsedAt: now } });
      if (session.count !== 1) return false;
      const updatedCredential = await tx.webAuthnCredential.updateMany({ where: { id: credential.id, userId: context.userId, revokedAt: null, counter: credential.counter }, data: { counter: BigInt(verification.authenticationInfo.newCounter), lastUsedAt: now } });
      if (updatedCredential.count !== 1) throw new Error("Passkey changed during unlock");
      await tx.trustedDevice.updateMany({ where: { id: trusted.id, userId: context.userId, revokedAt: null }, data: { lastUsedAt: now } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 8_000 });
    if (!unlocked) return Response.json({ error: "Unlock state changed. Try again." }, { status: 409 });
    await clearMobileLockUnlockPreAuth();
    await writeSecurityEvent({ userId: context.userId, eventType: "PASSKEY_LOGIN_SUCCESS", ip, userAgent: request.headers.get("user-agent"), details: { method: "mobile_app_lock_passkey_unlock", credentialDeviceType: verification.authenticationInfo.credentialDeviceType, backedUp: verification.authenticationInfo.credentialBackedUp } });
    return Response.json({ success: true, unlocked: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request." }, { status: 400 });
    console.error("[MOBILE_LOCK_PASSKEY_VERIFY] Unlock failed");
    return Response.json({ error: "Passkey unlock failed. Use OTP unlock." }, { status: 401 });
  }
}
