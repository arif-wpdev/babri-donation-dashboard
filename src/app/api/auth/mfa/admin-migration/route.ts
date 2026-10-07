import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { canMigrateOrgAdminToPasswordless } from "@/lib/auth-session-policy";
import { ensureSameOrigin, isMfaConfigurationReady, requestIp, writeSecurityEvent } from "@/lib/auth-security";

const schema = z.object({ password: z.string().min(1).max(256) }).strict();

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    if (user.role !== "ORG_ADMIN" || !user.authSessionId) return Response.json({ error: "Only a legacy Org Admin can migrate this account." }, { status: 403 });
    if (!isMfaConfigurationReady()) return Response.json({ error: "Passwordless authentication is not fully configured. Your current account remains unchanged." }, { status: 503 });
    const parsed = schema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Confirm your current password to start phone-only migration." }, { status: 400 });
    const account = await prisma.user.findUnique({
      where: { id: user.id },
      select: { id: true, role: true, orgId: true, phone: true, phoneVerifiedAt: true, passwordHash: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!account || !account.passwordHash || !account.phone || !account.phoneVerifiedAt || !account.orgId || account.org?.deletedAt) return Response.json({ error: "Verify a phone number and register a passkey before migrating this account." }, { status: 409 });
    if (!await bcrypt.compare(parsed.data.password, account.passwordHash)) return Response.json({ error: "Password confirmation failed." }, { status: 401 });
    if (!canMigrateOrgAdminToPasswordless({ role: account.role, passwordHash: account.passwordHash, phoneVerifiedAt: account.phoneVerifiedAt, organizationActive: Boolean(account.orgId) && !account.org?.deletedAt, hasActivePasskey: account.webAuthnCredentials.length > 0, suppliedPasswordValid: true, authenticationReady: isMfaConfigurationReady() })) return Response.json({ error: "This account is not ready to migrate." }, { status: 409 });

    const now = new Date();
    const migrated = await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: account.id, role: "ORG_ADMIN", orgId: account.orgId, phone: account.phone, phoneVerifiedAt: account.phoneVerifiedAt, passwordHash: account.passwordHash }, data: { passwordHash: null, passwordChangedAt: now } });
      if (changed.count !== 1) return false;
      await tx.authSession.updateMany({ where: { userId: account.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.loginPreAuth.updateMany({ where: { userId: account.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.loginTicket.updateMany({ where: { userId: account.id, consumedAt: null }, data: { consumedAt: now } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
    if (!migrated) return Response.json({ error: "Account changed during migration. Sign in and retry." }, { status: 409 });
    await writeSecurityEvent({ userId: user.id, eventType: "PASSWORD_CHANGED", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { method: "org_admin_phone_passkey_migration" } });
    return Response.json({ success: true, message: "Account migrated. Use your registered phone and passkey/OTP next time.", signOutRequired: true });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_ADMIN_MIGRATION] Account migration failed");
    return Response.json({ error: "Account migration could not be completed." }, { status: 400 });
  }
}