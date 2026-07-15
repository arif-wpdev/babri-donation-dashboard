import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { runSync } from "@/lib/sync";

/**
 * GET /api/cron/sync
 * Triggered by Vercel Cron (or any scheduler) to run automated syncs.
 *
 * Authentication: x-cron-secret header checked in middleware.ts.
 *
 * This handler finds all organizations that:
 * - Are not soft-deleted
 * - Have syncEnabled = true
 * - Are due for a sync (lastSyncedAt is null or older than syncInterval minutes)
 *
 * Vercel Cron config (vercel.json):
 * {
 *   "crons": [{ "path": "/api/cron/sync", "schedule": "0 * * * *" }]
 * }
 */
export async function GET(_request: NextRequest) {
  const now = new Date();

  // Find orgs due for sync
  const orgs = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      syncEnabled: true,
    },
    select: {
      id: true,
      name: true,
      syncInterval: true,
      lastSyncedAt: true,
    },
  });

  const dueOrgs = orgs.filter((org) => {
    if (!org.lastSyncedAt) return true; // Never synced
    const minutesSinceLastSync =
      (now.getTime() - org.lastSyncedAt.getTime()) / 1000 / 60;
    return minutesSinceLastSync >= org.syncInterval;
  });

  const results = await Promise.allSettled(
    dueOrgs.map((org) => runSync(org.id, "CRON"))
  );

  const summary = results.map((result, i) => ({
    orgId: dueOrgs[i]!.id,
    orgName: dueOrgs[i]!.name,
    outcome: result.status === "fulfilled" ? result.value : { success: false, error: String(result.reason) },
  }));

  console.log(`[CRON] Synced ${dueOrgs.length}/${orgs.length} orgs`, summary);

  return Response.json({
    processed: dueOrgs.length,
    skipped: orgs.length - dueOrgs.length,
    results: summary,
  });
}
