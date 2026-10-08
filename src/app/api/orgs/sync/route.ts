export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { runSync } from "@/lib/sync";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/rbac";
import { ensureSameOrigin } from "@/lib/auth-security";
import { canManageOrganizationData } from "@/lib/auth-session-policy";

export async function POST(req: NextRequest) {
  try {
    ensureSameOrigin(req);
    let user;
    try { user = await requireAuth(); } catch {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!user.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Must be ORG_ADMIN or SUPER_ADMIN
    if (user.role !== "ORG_ADMIN" && user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = user.orgId;

    // Check if the org has sync credentials configured
    const org = await prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      select: { wcBaseUrl: true, wcConsumerKey: true, wcConsumerSecret: true }
    });
    if (!canManageOrganizationData({ actorRole: user.role, actorOrgId: user.orgId, targetOrgId: orgId, targetOrganizationActive: Boolean(org) })) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (!org || !org.wcBaseUrl || !org.wcConsumerKey || !org.wcConsumerSecret) {
      return NextResponse.json({ error: "WooCommerce credentials not fully configured" }, { status: 400 });
    }

    // Trigger the sync manually
    console.log(`[MANUAL_SYNC] Triggered for Org ${orgId}`);
    const result = await runSync(orgId, "MANUAL");

    if (!result.success) {
      return NextResponse.json({ error: result.error || "Sync failed" }, { status: 500 });
    }

    return NextResponse.json({ success: true, stats: result });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "Invalid request origin") return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    console.error("[MANUAL_SYNC_API]", error);
    return NextResponse.json({ error: "Internal error during sync" }, { status: 500 });
  }
}
