import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createWooCommerceClient, fetchAllPages } from "../src/lib/woocommerce";
import { processWooCommerceOrder, recalculateDonorStats } from "../src/lib/sync/process-order";

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No org found");

  const client = createWooCommerceClient(org as any);

  console.log("Fetching processing and completed orders...");
  const orders = await fetchAllPages<any>(client, "orders", {
    status: "processing,completed",
  });

  console.log(`Found ${orders.length} orders. Processing...`);

  let added = 0;
  let updated = 0;

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    try {
      const result = await processWooCommerceOrder(order, org.id);
      if (result === "added") added++;
      if (result === "updated") updated++;
      if (i % 100 === 0) {
        console.log(`Processed ${i} / ${orders.length} orders...`);
      }
    } catch (e: any) {
      console.error(`Failed order ${order.id}: ${e.message}`);
    }
  }

  console.log("Recalculating donor stats...");
  await recalculateDonorStats(org.id);

  console.log(`Done! Added: ${added}, Updated: ${updated}`);
}

main().catch(console.error);
