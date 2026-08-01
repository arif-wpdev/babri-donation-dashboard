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
  const orders: WCOrder[] = [];

  // Fetch up to 250 latest orders to prevent Vercel 60s timeout
  for (let page = 1; page <= 3; page++) {
    const response = await client.get("orders", {
      status: "any",
      per_page: 100,
      page,
    });
    
    const data = response.data as WCOrder[];
    if (!data || data.length === 0) break;
    
    orders.push(...data);
    
    if (orders.length >= 250) {
      orders.length = 250; // Trim to exactly 250
      break;
    }
    
    const totalPages = parseInt((response.headers as Record<string, string>)["x-wp-totalpages"] ?? "1", 10);
    if (page >= totalPages) break;
  }

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
