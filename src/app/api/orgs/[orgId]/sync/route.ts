import type { NextRequest } from "next/server";
import { requireOrgAccess, ApiError } from "@/lib/rbac";
import { runSync } from "@/lib/sync";

export const maxDuration = 60; // Max execution time for Vercel Hobby

/**
 * POST /api/orgs/[orgId]/sync
 * Triggers a manual WooCommerce sync for the given organization.
 * Accessible by: SUPER_ADMIN (any org), ORG_ADMIN (own org only).
 *
 * This route is synchronous — it waits for the sync to complete.
 * For long-running syncs, consider moving to a background queue in the future.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    await requireOrgAccess(orgId);

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
    console.error("[POST /api/orgs/[orgId]/sync]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
