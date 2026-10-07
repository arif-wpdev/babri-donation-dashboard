import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { clearTrustedDevice, ensureSameOrigin, requestIp, trustedDeviceTokenHash, writeSecurityEvent } from "@/lib/auth-security";

export async function GET() {
  try {
    const user = await requireAuth();
    const devices = await prisma.webAuthnCredential.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, select: { id: true, credentialDeviceId: true, deviceName: true, deviceType: true, backedUp: true, createdAt: true, lastUsedAt: true, revokedAt: true, trustedDevices: { select: { id: true, createdAt: true, lastUsedAt: true, revokedAt: true } } } });
    const sessions = await prisma.authSession.findMany({ where: { userId: user.id, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { lastUsedAt: "desc" }, select: { id: true, createdAt: true, lastUsedAt: true, expiresAt: true } });
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true, phoneVerifiedAt: true, passwordHash: true } });
    return Response.json({ devices: devices.map(({ credentialDeviceId, trustedDevices, ...device }) => ({ ...device, credentialId: credentialDeviceId, trustedDevices })), sessions: sessions.map(({ id, createdAt, lastUsedAt, expiresAt }) => ({ id, createdAt, lastUsedAt, expiresAt, isCurrent: id === user.authSessionId })), phone: account?.phone ?? "", phoneVerified: Boolean(account?.phoneVerifiedAt), passwordless: account?.passwordHash === null });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    return Response.json({ error: "Could not load security settings" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    const body = await request.json().catch(() => null) as { credentialId?: unknown; sessionId?: unknown } | null;
    if (typeof body?.credentialId === "string") {
      const now = new Date();
      const currentTrustTokenHash = await trustedDeviceTokenHash();
      const revoked = await prisma.$transaction(async (tx) => {
        const credential = await tx.webAuthnCredential.updateMany({ where: { credentialId: body.credentialId as string, userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        if (credential.count !== 1) return false;
        const tokenRevoked = currentTrustTokenHash
          ? await tx.trustedDevice.updateMany({ where: { tokenHash: currentTrustTokenHash, credentialId: body.credentialId as string, userId: user.id, revokedAt: null }, data: { revokedAt: now } })
          : { count: 0 };
        await tx.trustedDevice.updateMany({ where: { credentialId: body.credentialId as string, userId: user.id, revokedAt: null }, data: { revokedAt: now } });
        return { success: true, clearCookie: tokenRevoked.count === 1 };
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
      if (!revoked) return Response.json({ error: "Device not found" }, { status: 404 });
      if (revoked.clearCookie) await clearTrustedDevice();
      await writeSecurityEvent({ userId: user.id, eventType: "DEVICE_REVOKED", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { type: "passkey" } });
      return Response.json({ success: true });
    }
    if (typeof body?.sessionId === "string") {
      const revoked = await prisma.authSession.updateMany({ where: { id: body.sessionId, userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      if (revoked.count !== 1) return Response.json({ error: "Session not found" }, { status: 404 });
      await writeSecurityEvent({ userId: user.id, eventType: "DEVICE_REVOKED", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { type: "session" } });
      return Response.json({ success: true });
    }
    return Response.json({ error: "Select a passkey or session to revoke" }, { status: 400 });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    return Response.json({ error: "Could not revoke security credential" }, { status: 500 });
  }
}
