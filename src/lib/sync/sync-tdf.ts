import { processTdfDonation, type TdfDonation } from "./process-tdf-donation";
import { recalculateDonorStats } from "./process-order";

export interface SyncDonationsResult {
  total: number;
  added: number;
  updated: number;
}

/**
 * Fetches donations from the Custom TDF Plugin REST API.
 */
export async function syncTdfDonations(
  orgId: string,
  tdfApiKey: string,
  baseUrl: string // use org.wcBaseUrl
): Promise<SyncDonationsResult> {
  let added = 0;
  let updated = 0;
  let totalProcessed = 0;

  // Fetch orders modified in the last 7 days
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const modifiedAfter = sevenDaysAgo.toISOString().replace("T", " ").substring(0, 19);

  let page = 1;
  const perPage = 100;

  while (true) {
    const url = new URL(`${baseUrl}/wp-json/tdf-donation/v1/donations`);
    url.searchParams.set("page", page.toString());
    url.searchParams.set("per_page", perPage.toString());
    url.searchParams.set("modified_after", modifiedAfter);

    const response = await fetch(url.toString(), {
      headers: {
        "X-TDF-Api-Key": tdfApiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`TDF API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const donations: TdfDonation[] = data.data || [];

    if (donations.length === 0) break;

    for (const donation of donations) {
      const result = await processTdfDonation(donation, orgId);
      if (result === "added") added++;
      if (result === "updated") updated++;
      totalProcessed++;
    }

    if (page >= (data.pages || 1)) break;
    page++;
    
    // Safety break to prevent lambda timeout
    if (page > 5) break; 
  }

  // Recalculate Donor Stats
  await recalculateDonorStats(orgId);

  return { total: totalProcessed, added, updated };
}
