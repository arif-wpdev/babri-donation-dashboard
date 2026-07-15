import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";

/**
 * DELETE /api/team/[id]
 * Deletes an employee account.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    if (user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetUserId = (await params).id;

    let orgId = user.orgId;

    // For SUPER_ADMIN without an orgId in a single-org setup, default to the first org
    if (!orgId && user.role === "SUPER_ADMIN") {
      const firstOrg = await prisma.organization.findFirst({
        where: { deletedAt: null },
      });
      if (firstOrg) {
        orgId = firstOrg.id;
      }
    }

    if (!orgId) {
      throw new ApiError("Organization not found", 400);
    }

    // Check if the user exists and belongs to the same org
    const targetUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { orgId: true, role: true },
    });

    if (!targetUser) {
      throw new ApiError("User not found", 404);
    }

    if (targetUser.orgId !== orgId && user.role !== "SUPER_ADMIN") {
      throw new ApiError("Forbidden: Cannot delete user from another organization", 403);
    }

    if (targetUser.role === "ORG_ADMIN" || targetUser.role === "SUPER_ADMIN") {
      throw new ApiError("Forbidden: Cannot delete an admin user via this endpoint", 403);
    }

    await prisma.user.delete({
      where: { id: targetUserId },
    });

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[DELETE /api/team/[id]]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
