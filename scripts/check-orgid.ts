import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const funds = await prisma.fund.findMany({ select: { orgId: true } });
  const donations = await prisma.donation.findMany({ select: { orgId: true }, take: 5 });
  const users = await prisma.user.findMany({ select: { email: true, orgId: true } });
  const orgs = await prisma.organization.findMany({ select: { id: true, name: true } });

  console.log("Funds orgIds:", Array.from(new Set(funds.map(f => f.orgId))));
  console.log("Donations orgIds:", Array.from(new Set(donations.map(d => d.orgId))));
  console.log("Users:", users);
  console.log("Orgs:", orgs);
}

main().catch(console.error).finally(() => prisma.$disconnect());
