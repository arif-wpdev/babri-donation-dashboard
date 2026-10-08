import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { ensureSameOrigin } from "@/lib/auth-security";
import { canAdministerEmployeeAccount } from "@/lib/auth-session-policy";

/**
 * DELETE is retained for compatibility but now disables the employee reversibly.
 * New Admin UI uses PATCH /api/admin/accounts/[userId]/status.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    if (user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetUserId = (await params).id;

    // Check if the user exists and belongs to the same org
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true, orgId: true, role: true, disabledAt: true, org: { select: { deletedAt: true } } },
    });

    if (!targetUser) {
      throw new ApiError("User not found", 404);
    }

    if (!targetUser.orgId || !canAdministerEmployeeAccount({ actorRole: user.role, actorOrgId: user.orgId, targetRole: targetUser.role, targetOrgId: targetUser.orgId, targetOrganizationActive: !targetUser.org?.deletedAt })) {
      throw new ApiError("Forbidden: Cannot delete user from another organization", 403);
    }

    if (targetUser.role === "ORG_ADMIN" || targetUser.role === "SUPER_ADMIN") {
      throw new ApiError("Forbidden: Cannot delete an admin user via this endpoint", 403);
    }

    const now = new Date();
    const disabled = await prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({ where: { id: targetUser.id, role: "ORG_USER", orgId: targetUser.orgId, disabledAt: targetUser.disabledAt, org: { deletedAt: null } }, data: { disabledAt: targetUser.disabledAt ?? now, passwordChangedAt: now } });
      if (changed.count !== 1) return false;
      await tx.authSession.updateMany({ where: { userId: targetUser.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.loginPreAuth.updateMany({ where: { userId: targetUser.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.loginTicket.updateMany({ where: { userId: targetUser.id, consumedAt: null }, data: { consumedAt: now } });
      await tx.trustedDevice.updateMany({ where: { userId: targetUser.id, revokedAt: null }, data: { revokedAt: now } });
      await tx.webAuthnCredential.updateMany({ where: { userId: targetUser.id, revokedAt: null }, data: { revokedAt: now } });
      return true;
    }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 10_000 });
    if (!disabled) throw new ApiError("Account status changed", 409);

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[DELETE /api/team/[id]]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
