import type { NextRequest } from "next/server";
import { requireAuth, ApiError } from "@/lib/rbac";
import { ensureSameOrigin } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { canManageOrganizationData } from "@/lib/auth-session-policy";
import { runSync } from "@/lib/sync";

export const maxDuration = 60; // Max execution time for Vercel Hobby

/**
 * POST /api/orgs/[orgId]/sync
 * Triggers a manual WooCommerce sync for the given organization.
 * Accessible by: SUPER_ADMIN (any active org), ORG_ADMIN (own active org only).
 *
 * This route is synchronous — it waits for the sync to complete.
 * For long-running syncs, consider moving to a background queue in the future.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    ensureSameOrigin(_request);
    const { orgId } = await params;
    const actor = await requireAuth();
    const activeOrganization = await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } });
    if (!canManageOrganizationData({ actorRole: actor.role, actorOrgId: actor.orgId, targetOrgId: orgId, targetOrganizationActive: Boolean(activeOrganization) })) {
      throw new ApiError("Forbidden", 403);
    }

    const result = await runSync(orgId, "MANUAL");

    if (!result.success) {
      return Response.json(
        { error: result.error, syncLogId: result.syncLogId },
        { status: 422 }
      );
    }

    return Response.json(
      { message: "Sync completed successfully", syncLogId: result.syncLogId },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[POST /api/orgs/[orgId]/sync]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
