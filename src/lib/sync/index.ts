import { prisma } from "@/lib/prisma";
import { createWooCommerceClient } from "@/lib/woocommerce";
import { syncFunds } from "@/lib/sync/sync-funds";
import { syncDonors } from "@/lib/sync/sync-donors";
import { syncDonations } from "@/lib/sync/sync-donations";
import { syncTdfDonations } from "@/lib/sync/sync-tdf";
import type { SyncTrigger } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Sync Orchestrator
//
// Execution order: Funds → Donors → Donations
// (Donations have FK references to both Funds and Donors)
//
// A SyncLog record is created before sync starts and updated on completion.
// If the org already has a RUNNING sync, we bail out to prevent concurrent runs.
// ─────────────────────────────────────────────────────────────────────────────

export type SyncResult =
  | { success: true; syncLogId: string }
  | { success: false; error: string; syncLogId?: string };

export async function runSync(
  orgId: string,
  triggeredBy: SyncTrigger
): Promise<SyncResult> {
  // ── Guard: prevent concurrent syncs ──────────────────────────────────────
  // If a sync is RUNNING but started more than 15 minutes ago, consider it dead (e.g. Vercel timeout)
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
  
  const running = await prisma.syncLog.findFirst({
    where: { 
      orgId, 
      status: "RUNNING",
      startedAt: { gte: fifteenMinutesAgo }
    },
    select: { id: true },
  });

  if (running) {
    return {
      success: false,
      error: "A sync is already running for this organization.",
    };
  }

  // Clean up any stale RUNNING syncs
  await prisma.syncLog.updateMany({
    where: {
      orgId,
      status: "RUNNING",
      startedAt: { lt: fifteenMinutesAgo }
    },
    data: {
      status: "FAILED",
      error: "Sync timed out or crashed.",
      completedAt: new Date()
    }
  });

  // ── Fetch org with WooCommerce credentials ────────────────────────────────
  const org = await prisma.organization.findUnique({
    where: { id: orgId, deletedAt: null },
    select: {
      id: true,
      wcBaseUrl: true,
      wcConsumerKey: true,
      wcConsumerSecret: true,
      tdfApiKey: true,
      syncEnabled: true,
    },
  });

  if (!org) {
    return { success: false, error: "Organization not found." };
  }

  if (!org.syncEnabled) {
    return { success: false, error: "Sync is disabled for this organization." };
  }

  // ── Create SyncLog ────────────────────────────────────────────────────────
  const syncLog = await prisma.syncLog.create({
    data: {
      orgId,
      status: "RUNNING",
      triggeredBy,
    },
  });

  try {
    // ── WooCommerce Sync (Only if credentials exist) ───────────────────────
    let fundsResult = { total: 0, added: 0, updated: 0 };
    let donorsResult = { total: 0, added: 0, updated: 0 };
    let donationsResult = { total: 0, added: 0, updated: 0 };

    if (org.wcConsumerKey && org.wcConsumerSecret) {
      const client = createWooCommerceClient(org);
      fundsResult = await syncFunds(client, orgId);
      donorsResult = await syncDonors(client, orgId);
      donationsResult = await syncDonations(client, orgId);
    }

    // ── Step 4: Sync Custom Plugin Donations ─────────────────────────────
    let tdfAdded = 0;
    let tdfUpdated = 0;
    let tdfTotal = 0;
    
    if (org.tdfApiKey) {
      const tdfResult = await syncTdfDonations(orgId, org.tdfApiKey, org.wcBaseUrl);
      tdfAdded = tdfResult.added;
      tdfUpdated = tdfResult.updated;
      tdfTotal = tdfResult.total;
    }

    // ── Mark sync as successful ───────────────────────────────────────────
    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "SUCCESS",
        fundsTotal: fundsResult.total,
        fundsAdded: fundsResult.added,
        fundsUpdated: fundsResult.updated,
        donorsTotal: donorsResult.total,
        donorsAdded: donorsResult.added,
        donorsUpdated: donorsResult.updated,
        donationsTotal: donationsResult.total + tdfTotal,
        donationsAdded: donationsResult.added + tdfAdded,
        donationsUpdated: donationsResult.updated + tdfUpdated,
        completedAt: new Date(),
      },
    });

    // ── Update org lastSyncedAt ───────────────────────────────────────────
    await prisma.organization.update({
      where: { id: orgId },
      data: { lastSyncedAt: new Date() },
    });

    return { success: true, syncLogId: syncLog.id };
  } catch (error) {
    // ── Mark sync as failed ───────────────────────────────────────────────
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    await prisma.syncLog.update({
      where: { id: syncLog.id },
      data: {
        status: "FAILED",
        error: errorMessage,
        completedAt: new Date(),
      },
    });

    return {
      success: false,
      error: errorMessage,
      syncLogId: syncLog.id,
    };
  }
}
