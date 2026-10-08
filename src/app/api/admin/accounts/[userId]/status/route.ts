import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { canDisableAdminManagedAccount, canPermanentlyDeleteUser, canReactivateManagedUser, getAdminAccountStatus } from "@/lib/auth-session-policy";
import { ensureSameOrigin, requestIp, writeSecurityEvent } from "@/lib/auth-security";

const bodySchema = z.object({ disabled: z.boolean() }).strict();
const deleteSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    ensureSameOrigin(request);
    const actor = await requireAdminAreaAccess();
    const { userId } = await params;
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "Choose a valid account status." }, { status: 400 });

    const target = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, role: true, orgId: true, disabledAt: true, phoneVerifiedAt: true, passwordHash: true, org: { select: { deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    });
    if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
    const targetAccess = { actorRole: actor.role, actorOrgId: actor.orgId, targetRole: target.role, targetOrgId: target.orgId, targetOrganizationActive: !target.org?.deletedAt };
    if (parsed.data.disabled ? !canDisableAdminManagedAccount(targetAccess) : !canReactivateManagedUser({ ...targetAccess, currentlyDisabled: Boolean(target.disabledAt) })) return Response.json({ error: "Forbidden." }, { status: 403 });

    if (parsed.data.disabled === Boolean(target.disabledAt)) {
      return Response.json({ success: true, data: { id: target.id, disabledAt: target.disabledAt, status: getAdminAccountStatus({ role: target.role, passwordHash: target.passwordHash, phoneVerifiedAt: target.phoneVerifiedAt, hasActivePasskey: target.webAuthnCredentials.length > 0, authenticationReady: false, disabledAt: target.disabledAt }) } });
    }
    const disabledAt = parsed.data.disabled ? new Date() : null;
    const now = new Date();
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.user.updateMany({
        where: { id: target.id, role: target.role, orgId: target.orgId, disabledAt: target.disabledAt, ...(target.orgId ? { org: { deletedAt: null } } : {}) },
        data: { disabledAt, passwordChangedAt: parsed.data.disabled ? now : undefined },
      });
      if (update.count !== 1) return false;
      if (parsed.data.disabled) {
        await tx.authSession.updateMany({ where: { userId: target.id, revokedAt: null }, data: { revokedAt: now } });
        await tx.loginPreAuth.updateMany({ where: { userId: target.id, consumedAt: null }, data: { consumedAt: now } });
        await tx.loginTicket.updateMany({ where: { userId: target.id, consumedAt: null }, data: { consumedAt: now } });
      }
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
    if (!changed) return Response.json({ error: "Account status changed. Refresh and try again." }, { status: 409 });

    await writeSecurityEvent({ userId: target.id, eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { action: parsed.data.disabled ? "account_disabled" : "account_reenabled", actorRole: actor.role } });
    const hasActivePasskey = target.webAuthnCredentials.length > 0;
    return Response.json({ success: true, data: { id: target.id, disabledAt, status: getAdminAccountStatus({ role: target.role, passwordHash: target.passwordHash, phoneVerifiedAt: target.phoneVerifiedAt, hasActivePasskey, authenticationReady: false, disabledAt }) } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[PATCH /api/admin/accounts/[userId]/status] Account status update failed");
    return Response.json({ error: "Could not update account status." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  try {
    ensureSameOrigin(request);
    const actor = await requireAdminAreaAccess();
    if (actor.role !== "SUPER_ADMIN") return Response.json({ error: "Only Super Admin can permanently delete accounts." }, { status: 403 });
    const { userId } = await params;
    const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: 'Explicit confirmation "DELETE" is required.' }, { status: 400 });

    const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, orgId: true, disabledAt: true, org: { select: { deletedAt: true } } } });
    if (!target) return Response.json({ error: "Account not found." }, { status: 404 });
    if (!canPermanentlyDeleteUser({ actorRole: actor.role, targetRole: target.role, targetOrgId: target.orgId, targetDisabled: Boolean(target.disabledAt), targetOrganizationActive: !target.org?.deletedAt })) return Response.json({ error: "Disable the account first. Permanent deletion is available only for disabled accounts in active organizations." }, { status: 403 });

    const deletionEvent = await prisma.$transaction(async (tx) => {
      const account = await tx.user.findUnique({ where: { id: target.id }, select: { role: true, orgId: true, disabledAt: true, org: { select: { deletedAt: true } } } });
      if (!account || !canPermanentlyDeleteUser({ actorRole: actor.role, targetRole: account.role, targetOrgId: account.orgId, targetDisabled: Boolean(account.disabledAt), targetOrganizationActive: !account.org?.deletedAt })) return false;
      const changed = await tx.user.deleteMany({ where: { id: target.id, role: account.role, orgId: account.orgId, disabledAt: account.disabledAt } });
      if (changed.count !== 1) return false;
      await tx.authSession.deleteMany({ where: { userId: target.id } });
      await tx.loginPreAuth.deleteMany({ where: { userId: target.id } });
      await tx.loginTicket.deleteMany({ where: { userId: target.id } });
      await tx.trustedDevice.deleteMany({ where: { userId: target.id } });
      await tx.webAuthnCredential.deleteMany({ where: { userId: target.id } });
      await tx.authRecoveryCode.deleteMany({ where: { userId: target.id } });
      await tx.authChallenge.deleteMany({ where: { userId: target.id } });
      await tx.securityEvent.updateMany({ where: { userId: target.id }, data: { userId: null } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
    if (!deletionEvent) return Response.json({ error: "Account changed during deletion. Refresh and retry." }, { status: 409 });
    await writeSecurityEvent({ eventType: "SUSPICIOUS_ACTIVITY", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { action: "disabled_account_permanently_deleted", targetRole: target.role, actorRole: actor.role } });
    return Response.json({ success: true, deleted: true });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[DELETE /api/admin/accounts/[userId]/status] Permanent account deletion failed");
    return Response.json({ error: "Could not delete account." }, { status: 500 });
  }
}