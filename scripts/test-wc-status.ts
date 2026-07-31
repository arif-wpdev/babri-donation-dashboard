import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { createWooCommerceClient, fetchAllPages } from "../src/lib/woocommerce";

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No org found");

  const client = createWooCommerceClient(org);

  try {
    console.log("Fetching processing,completed...");
    const ordersString = await fetchAllPages(client, "orders", {
      status: "processing,completed",
      per_page: 5,
    });
    console.log("String status result count:", ordersString.length);
    if (ordersString.length > 0) {
      console.log("Statuses returned:", ordersString.map((o: any) => o.status));
    }
  } catch (e: any) {
    console.log("String status failed:", e.message);
  }

  try {
    console.log("\nFetching array ['processing', 'completed']...");
    const ordersArray = await fetchAllPages(client, "orders", {
      status: ["processing", "completed"],
      per_page: 5,
    });
    console.log("Array status result count:", ordersArray.length);
    if (ordersArray.length > 0) {
      console.log("Statuses returned:", ordersArray.map((o: any) => o.status));
    }
  } catch (e: any) {
    console.log("Array status failed:", e.message);
  }

  try {
    console.log("\nFetching status: any ...");
    const ordersAny = await fetchAllPages(client, "orders", {
      status: "any",
      per_page: 5,
    });
    console.log("Any status result count:", ordersAny.length);
    if (ordersAny.length > 0) {
      console.log("Statuses returned:", ordersAny.map((o: any) => o.status));
    }
  } catch (e: any) {
    console.log("Any status failed:", e.message);
  }
}

main().catch(console.error);
