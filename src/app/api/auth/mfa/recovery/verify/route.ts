import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ensureSameOrigin, enforceRateLimits, getPreAuthUser, hashAuthValue, requestIp, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your password again." }, { status: 401 });
    if (preAuth.user.disabledAt || preAuth.user.org?.deletedAt) return Response.json({ error: "Recovery is unavailable for this account." }, { status: 401 });
    if (preAuth.preAuth.passkeyOnly) return Response.json({ error: "This trusted device requires its registered passkey." }, { status: 403 });
    const rate = await enforceRateLimits([
      { key: `recovery-login-user:${preAuth.user.id}`, limit: 5, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
      { key: `recovery-login-ip:${requestIp(request.headers)}`, limit: 20, windowMs: 24 * 60 * 60_000, blockMs: 24 * 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "Recovery is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json().catch(() => null) as { code?: unknown } | null;
    if (typeof body?.code !== "string" || body.code.length > 64) return Response.json({ error: "Enter a valid recovery code." }, { status: 400 });
    const codeHash = hashAuthValue(body.code.trim().toUpperCase(), "recovery");
    const now = new Date();
    const ticket = randomBytes(32).toString("base64url");
    const ticketHash = createHash("sha256").update(ticket).digest("hex");
    const consumed = await prisma.$transaction(async (tx) => {
      const currentPreAuth = await tx.loginPreAuth.findUnique({ where: { id: preAuth.preAuth.id }, select: { userId: true, passkeyOnly: true, consumedAt: true, expiresAt: true } });
      if (!currentPreAuth || currentPreAuth.userId !== preAuth.user.id || currentPreAuth.passkeyOnly || currentPreAuth.consumedAt || currentPreAuth.expiresAt <= now) return false;
      const recoveryCodes = await tx.authRecoveryCode.findMany({ where: { userId: preAuth.user.id, usedAt: null }, select: { id: true, codeHash: true }, take: 20 });
      const recovery = recoveryCodes.find((candidate) => {
        const stored = Buffer.from(candidate.codeHash, "hex");
        const presented = Buffer.from(codeHash, "hex");
        return stored.length === presented.length && timingSafeEqual(stored, presented);
      });
      if (!recovery) return false;
      const codeConsumed = await tx.authRecoveryCode.updateMany({ where: { id: recovery.id, userId: preAuth.user.id, usedAt: null }, data: { usedAt: now } });
      if (codeConsumed.count !== 1) return false;
      const preAuthConsumed = await tx.loginPreAuth.updateMany({ where: { id: preAuth.preAuth.id, consumedAt: null, expiresAt: { gt: now }, passkeyOnly: false }, data: { consumedAt: now } });
      if (preAuthConsumed.count !== 1) throw new Error("Pre-authentication state already consumed");
      await tx.loginTicket.create({ data: { userId: preAuth.user.id, preauthId: preAuth.preAuth.id, tokenHash: ticketHash, expiresAt: new Date(now.getTime() + 2 * 60_000) } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    if (!consumed) {
      await writeSecurityEvent({ userId: preAuth.user.id, eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { method: "recovery_code_failure" } });
      return Response.json({ error: "Invalid or already-used recovery code." }, { status: 401 });
    }
    return Response.json({ success: true, loginTicket: ticket, expiresInSeconds: 120 });
  } catch {
    console.error("[AUTH_RECOVERY_LOGIN] Recovery sign-in failed");
    return Response.json({ error: "Recovery could not be completed" }, { status: 400 });
  }
}
