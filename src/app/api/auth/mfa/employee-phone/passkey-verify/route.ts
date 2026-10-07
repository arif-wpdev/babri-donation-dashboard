import { verifyRegistrationResponse } from "@simplewebauthn/server";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, isWebAuthnConfigurationReady, isPasskeyChallengeUsable, issueTrustedDeviceInTransaction, requestIp, webAuthnConfiguration, writeSecurityEvent } from "@/lib/auth-security";
import { isPhonePasswordlessFirstPasskeyEligible } from "@/lib/auth-session-policy";
import { employeePasskeySetupCookieName } from "@/lib/employee-enrollment";

const schema = (body: unknown): body is { response: RegistrationResponseJSON } => Boolean(body && typeof body === "object" && "response" in body && body.response && typeof body.response === "object" && "id" in body.response && typeof body.response.id === "string" && body.response.id.length <= 4096);

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isWebAuthnConfigurationReady(request)) return Response.json({ error: "Passkey setup is temporarily unavailable." }, { status: 503 });
    const token = (await cookies()).get(employeePasskeySetupCookieName)?.value;
    if (!token) return Response.json({ error: "Phone verification expired. Request a new code." }, { status: 401 });
    const tokenHash = hashAuthValue(token, "employee-passkey-enrollment");
    const enrollment = await prisma.loginPreAuth.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            phone: true,
            role: true,
            phoneVerifiedAt: true,
            passwordHash: true,
            orgId: true,
            org: { select: { id: true, slug: true, deletedAt: true } },
            webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 },
          },
        },
      },
    });
    const now = new Date();
    if (!enrollment || !isPhonePasswordlessFirstPasskeyEligible({ role: enrollment.user.role, phoneVerifiedAt: enrollment.user.phoneVerifiedAt, passwordHash: enrollment.user.passwordHash, organizationActive: Boolean(enrollment.user.orgId) && !enrollment.user.org?.deletedAt, hasActivePasskey: enrollment.user.webAuthnCredentials.length > 0, enrollmentMarker: enrollment.deliveryChannel, passkeyOnly: enrollment.passkeyOnly, enrollmentConsumedAt: enrollment.consumedAt, enrollmentExpiresAt: enrollment.expiresAt, now }) || !enrollment.user.phone || !enrollment.user.orgId) return Response.json({ error: "Phone verification expired. Request a new code." }, { status: 401 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-first-passkey-verify:${enrollment.user.id}`, limit: 10, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `employee-first-passkey-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 30, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Passkey setup is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body: unknown = await request.json().catch(() => null);
    if (!schema(body) || !body.response.id) return Response.json({ error: "Invalid passkey registration response." }, { status: 400 });
    const identifierHash = hashAuthValue(enrollment.id, "employee-first-passkey-registration");
    const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PASSKEY_REGISTRATION" } } });
    if (!isPasskeyChallengeUsable(challenge, enrollment.user.id, now) || challenge?.purpose !== enrollment.id || !challenge.challenge) return Response.json({ error: "Passkey setup expired. Request a new OTP." }, { status: 400 });
    const activeChallenge = challenge.challenge;
    const { origin, rpID } = webAuthnConfiguration(request);
    const verification = await verifyRegistrationResponse({ response: body.response, expectedChallenge: activeChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: true });
    if (!verification.verified || !verification.registrationInfo) return Response.json({ error: "Passkey verification failed." }, { status: 400 });
    const info = verification.registrationInfo;
    if (info.rpID !== rpID || info.origin !== origin || !info.userVerified) return Response.json({ error: "Passkey verification failed." }, { status: 400 });
    const credentialId = Buffer.from(info.credentialID).toString("base64url");
    const ticket = randomBytes(32).toString("base64url");

    await prisma.$transaction(async (tx) => {
      const currentUser = await tx.user.findUnique({
        where: { id: enrollment.user.id },
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
      });
      if (!currentUser || currentUser.phone !== enrollment.user.phone || currentUser.orgId !== enrollment.user.orgId || !isPhonePasswordlessFirstPasskeyEligible({ role: currentUser.role, phoneVerifiedAt: currentUser.phoneVerifiedAt, passwordHash: currentUser.passwordHash, organizationActive: Boolean(currentUser.orgId) && !currentUser.org?.deletedAt, hasActivePasskey: currentUser.webAuthnCredentials.length > 0, enrollmentMarker: enrollment.deliveryChannel, passkeyOnly: enrollment.passkeyOnly, enrollmentConsumedAt: enrollment.consumedAt, enrollmentExpiresAt: enrollment.expiresAt, now })) {
        throw new Error("Employee invite is no longer eligible for first-passkey setup");
      }
      const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, userId: enrollment.user.id, purpose: enrollment.id, challenge: activeChallenge, consumedAt: null, otpExpiresAt: { gt: now } }, data: { consumedAt: now } });
      if (claimed.count !== 1) throw new Error("Passkey challenge already consumed");
      const preAuthConsumed = await tx.loginPreAuth.updateMany({ where: { id: enrollment.id, tokenHash, userId: enrollment.user.id, deliveryChannel: "employee-enrollment", passkeyOnly: true, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
      if (preAuthConsumed.count !== 1) throw new Error("Employee enrollment token already consumed");
      const userUpdated = await tx.user.updateMany({ where: { id: currentUser.id, role: currentUser.role, phone: currentUser.phone, phoneVerifiedAt: null, passwordHash: null, orgId: currentUser.orgId }, data: { phoneVerifiedAt: now } });
      if (userUpdated.count !== 1) throw new Error("Employee invite is no longer eligible for first-passkey setup");
      await tx.webAuthnCredential.create({ data: {
        userId: enrollment.user.id,
        credentialId,
        publicKey: Buffer.from(info.credentialPublicKey).toString("base64url"),
        counter: BigInt(info.counter),
        transports: body.response.response.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp,
        deviceName: "Employee passkey",
        credentialDeviceId: credentialId,
      } });
      await issueTrustedDeviceInTransaction(enrollment.user.id, credentialId, tx);
      await tx.loginTicket.create({ data: { userId: enrollment.user.id, preauthId: enrollment.id, tokenHash: createHash("sha256").update(ticket).digest("hex"), expiresAt: new Date(now.getTime() + 2 * 60_000) } });
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });

    await writeSecurityEvent({ userId: enrollment.user.id, eventType: "PASSKEY_REGISTERED", ip, userAgent: request.headers.get("user-agent"), details: { method: "required_first_employee_passkey", credentialDeviceType: info.credentialDeviceType, backedUp: info.credentialBackedUp } });
    const response = Response.json({ success: true, onboardingTicket: ticket, expiresInSeconds: 120, redirectTo: "/dashboard" });
    response.headers.append("set-cookie", `${employeePasskeySetupCookieName}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request." }, { status: 400 });
    console.error("[AUTH_EMPLOYEE_PASSKEY_VERIFY] First passkey setup failed");
    return Response.json({ error: "Passkey setup failed or expired. Request a new verification code." }, { status: 400 });
  }
}