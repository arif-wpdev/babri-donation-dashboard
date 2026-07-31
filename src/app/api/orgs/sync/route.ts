export const maxDuration = 60;

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { runSync } from "@/lib/sync";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !session.user.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Must be ORG_ADMIN or SUPER_ADMIN
    if (session.user.role !== "ORG_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const orgId = session.user.orgId;

    // Check if the org has sync credentials configured
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { wcBaseUrl: true, wcConsumerKey: true, wcConsumerSecret: true }
    });

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
  } catch (error: any) {
    console.error("[MANUAL_SYNC_API]", error);
    return NextResponse.json({ error: "Internal error during sync" }, { status: 500 });
  }
}
