const { PrismaClient } = require("@prisma/client");
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
  console.log("First 5 donations:", JSON.stringify(data.data.map(d => ({ id: d.id, created_at: d.created_at, donor: d.donor_info.name })), null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
