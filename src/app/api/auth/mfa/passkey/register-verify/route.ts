import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { ensureSameOrigin, hashAuthValue, isMfaConfigurationReady, issueTrustedDevice, isPasskeyChallengeUsable, requestIp, webAuthnConfiguration, writeSecurityEvent } from "@/lib/auth-security";

const schema = (body: unknown): body is { response: RegistrationResponseJSON; deviceName?: string } => Boolean(body && typeof body === "object" && "response" in body && body.response && typeof body.response === "object" && "id" in body.response && typeof body.response.id === "string" && body.response.id.length <= 4096);

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Passkey registration is unavailable" }, { status: 503 });
    const user = await requireAuth();
    const body: unknown = await request.json().catch(() => null);
    if (!schema(body) || !body.response.id) return Response.json({ error: "Invalid passkey registration response" }, { status: 400 });
    const identifierHash = hashAuthValue(user.id, "passkey-registration");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PASSKEY_REGISTRATION" } } });
    const now = new Date();
    if (!isPasskeyChallengeUsable(challenge, user.id, now)) return Response.json({ error: "Registration request expired" }, { status: 400 });
    if (!challenge?.challenge) return Response.json({ error: "Registration request expired" }, { status: 400 });
    const activeChallenge = challenge.challenge;
    const { origin, rpID } = webAuthnConfiguration(request);
    const verification = await verifyRegistrationResponse({ response: body.response, expectedChallenge: activeChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) return Response.json({ error: "Passkey registration verification failed" }, { status: 400 });
    const info = verification.registrationInfo;
    if (info.rpID !== rpID || info.origin !== origin || !info.userVerified) return Response.json({ error: "Passkey registration verification failed" }, { status: 400 });
    const credentialId = Buffer.from(info.credentialID).toString("base64url");
    const publicKey = Buffer.from(info.credentialPublicKey).toString("base64url");
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 100) : "Passkey";
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, challenge: activeChallenge, consumedAt: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) throw new Error("Registration challenge already consumed");
      await tx.webAuthnCredential.create({
        data: {
          userId: user.id,
          credentialId,
          publicKey,
          counter: BigInt(info.counter),
          transports: body.response.response.transports ?? [],
          deviceType: info.credentialDeviceType,
          backedUp: info.credentialBackedUp,
          deviceName: deviceName || "Passkey",
          credentialDeviceId: credentialId,
        },
      });
    }, { isolationLevel: "Serializable" });
    await writeSecurityEvent({ userId: user.id, eventType: "PASSKEY_REGISTERED", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { credentialDeviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp } });
    await issueTrustedDevice(user.id, credentialId);
    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[AUTH_PASSKEY_REGISTER_VERIFY] Passkey registration failed");
    return Response.json({ error: "Passkey registration failed or request expired" }, { status: 400 });
  }
}
