import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { canAdministerEmployeeAccount, canReactivateEmployee, getAdminAccountStatus } from "@/lib/auth-session-policy";
import { ensureSameOrigin, requestIp, writeSecurityEvent } from "@/lib/auth-security";

const bodySchema = z.object({ disabled: z.boolean() }).strict();

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
    if (parsed.data.disabled ? !canAdministerEmployeeAccount(targetAccess) : !canReactivateEmployee({ ...targetAccess, currentlyDisabled: Boolean(target.disabledAt) })) return Response.json({ error: "Forbidden." }, { status: 403 });

    if (parsed.data.disabled === Boolean(target.disabledAt)) {
      return Response.json({ success: true, data: { id: target.id, disabledAt: target.disabledAt, status: getAdminAccountStatus({ role: target.role, passwordHash: target.passwordHash, phoneVerifiedAt: target.phoneVerifiedAt, hasActivePasskey: target.webAuthnCredentials.length > 0, authenticationReady: false, disabledAt: target.disabledAt }) } });
    }
    const disabledAt = parsed.data.disabled ? new Date() : null;
    const now = new Date();
    const changed = await prisma.$transaction(async (tx) => {
      const update = await tx.user.updateMany({
        where: { id: target.id, role: "ORG_USER", orgId: target.orgId, disabledAt: target.disabledAt, org: { deletedAt: null } },
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