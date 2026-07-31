import { fetchAllPages, type WooCommerceClient } from "@/lib/woocommerce";
import { processWooCommerceOrder, recalculateDonorStats, type WCOrder } from "./process-order";

export interface SyncDonationsResult {
  total: number;
  added: number;
  updated: number;
}

/**
 * Fetches all WooCommerce orders for an org and upserts them as Donations.
 *
 * Resolution logic:
 * - donor:  look up Donor by [orgId, wcCustomerId] — null for guests
 * - fund:   look up Fund by [orgId, wcProductId] using first line_item's product_id
 */
export async function syncDonations(
  client: WooCommerceClient,
  orgId: string
): Promise<SyncDonationsResult> {
  const orders = await fetchAllPages<WCOrder>(client, "orders", {
    status: "processing,completed", // Fetch both processing and completed orders
  });

  let added = 0;
  let updated = 0;

  for (const order of orders) {
    const result = await processWooCommerceOrder(order, orgId);
    if (result === "added") added++;
    if (result === "updated") updated++;
  }

  // ── Recalculate Donor Stats (totalSpent, ordersCount, lastDonationAt) ──────
  // We do this after all donations are synced to ensure Donor stats match actual donations
  await recalculateDonorStats(orgId);

  return { total: orders.length, added, updated };
}
