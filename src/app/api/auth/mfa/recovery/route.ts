import { randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { canGenerateAccountRecoveryCodes } from "@/lib/auth-session-policy";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    const rate = await enforceRateLimits([{ key: `recovery:${user.id}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 }, { key: `recovery-ip:${requestIp(request.headers)}`, limit: 20, windowMs: 60 * 60_000, blockMs: 60 * 60_000 }]);
    if (!rate.allowed) return Response.json({ error: "Recovery is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });
    const body = await request.json().catch(() => null) as { action?: unknown; password?: unknown; code?: unknown } | null;
    if (body?.action === "generate") {
      const account = await prisma.user.findUnique({ where: { id: user.id }, select: { role: true, passwordHash: true, phoneVerifiedAt: true, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } } });
      if (!account || !canGenerateAccountRecoveryCodes({ role: account.role, passwordHash: account.passwordHash, phoneVerifiedAt: account.phoneVerifiedAt, hasActivePasskey: account.webAuthnCredentials.length > 0 })) return Response.json({ error: "Complete phone verification and register a passkey before generating recovery codes." }, { status: 409 });
      if (account.passwordHash) {
        if (typeof body.password !== "string" || !await bcrypt.compare(body.password, account.passwordHash)) return Response.json({ error: "Password confirmation failed." }, { status: 401 });
      }
      const codes = Array.from({ length: 10 }, () => randomBytes(9).toString("base64url").toUpperCase());
      const recoveryHashes = codes.map((code) => hashAuthValue(code, "recovery"));
      await prisma.$transaction(async (tx) => {
        await tx.authRecoveryCode.deleteMany({ where: { userId: user.id } });
        await tx.authRecoveryCode.createMany({ data: recoveryHashes.map((codeHash) => ({ userId: user.id, codeHash })) });
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
      await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { action: "recovery_codes_generated" } });
      return Response.json({ success: true, recoveryCodes: codes });
    }
    if (body?.action === "use") {
      if (typeof body.code !== "string" || body.code.length > 64) return Response.json({ error: "Invalid recovery code." }, { status: 400 });
      const codeHash = hashAuthValue(body.code.trim().toUpperCase(), "recovery");
      const candidates = await prisma.authRecoveryCode.findMany({ where: { userId: user.id, usedAt: null }, select: { id: true, codeHash: true }, take: 20 });
      const match = candidates.find((candidate) => {
        const stored = Buffer.from(candidate.codeHash, "hex");
        const presented = Buffer.from(codeHash, "hex");
        return stored.length === presented.length && timingSafeEqual(stored, presented);
      });
      if (!match) return Response.json({ error: "Invalid or already-used recovery code." }, { status: 400 });
      const recovered = await prisma.authRecoveryCode.updateMany({ where: { id: match.id, userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
      if (recovered.count !== 1) return Response.json({ error: "Invalid or already-used recovery code." }, { status: 409 });
      await writeSecurityEvent({ userId: user.id, eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { action: "recovery_code_used" } });
      return Response.json({ success: true });
    }
    return Response.json({ error: "Unknown recovery action." }, { status: 400 });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[AUTH_RECOVERY] Recovery operation failed");
    return Response.json({ error: "Recovery operation failed" }, { status: 400 });
  }
}
