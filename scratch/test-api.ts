import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findFirst({
    where: { tdfApiKey: { not: null } }
  });
  
  if (!org) {
    console.log("No org with TDF API key");
    return;
  }

  const url = `${org.wcBaseUrl}/wp-json/tdf-donation/v1/donations?per_page=5&page=1`;
  console.log("Fetching:", url);
  const res = await fetch(url, {
    headers: { "X-TDF-Api-Key": org.tdfApiKey }
  });
  
  const data = await res.json();
  console.log("First 5 donations:");
  if (data.data) {
     data.data.forEach(d => console.log(`ID: ${d.id}, created_at: ${d.created_at}, updated_at: ${d.updated_at}, name: ${d.donor_info.name}`));
  } else {
     console.log(data);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
