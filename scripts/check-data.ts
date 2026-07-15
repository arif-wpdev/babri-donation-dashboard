import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const funds = await prisma.fund.count();
  const donors = await prisma.donor.count();
  const donations = await prisma.donation.count();
  
  console.log(`Funds: ${funds}`);
  console.log(`Donors: ${donors}`);
  console.log(`Donations: ${donations}`);
  
  const orgs = await prisma.organization.findMany({
    select: { id: true, name: true, lastSyncedAt: true }
  });
  console.log("Orgs:", orgs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
