import { createWooCommerceClient } from "../src/lib/woocommerce";
import { prisma } from "../src/lib/prisma";

async function main() {
  const org = await prisma.organization.findFirst();
  if (!org) throw new Error("No org");
  
  const client = createWooCommerceClient(org);
  
  const { data } = await client.get("orders", { status: "processing", per_page: 5 });
  
  for (const order of data) {
    console.log(`Order #${order.id}:`);
    const meta = order.meta_data.filter((m: any) => 
      m.key.toLowerCase().includes('origin') || 
      m.key.toLowerCase().includes('source') || 
      m.key.toLowerCase().includes('utm') ||
      m.key.toLowerCase().includes('referral')
    );
    console.log(JSON.stringify(meta, null, 2));
  }
}

main().catch(console.error);
