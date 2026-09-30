/**
 * Local connectivity check for the configured database.
 * Read-only: prints server identity and row counts. Never prints credentials.
 *
 * Run: npx tsx scripts/check-connection.ts
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const info = await prisma.$queryRaw<
    { db: string; usr: string; ver: string }[]
  >`SELECT current_database() as db, current_user as usr, version() as ver`;

  const i = info[0];
  console.log("CONNECTED ✅");
  console.log("  database :", i.db);
  console.log("  user     :", i.usr);
  console.log("  engine   :", String(i.ver).split(",")[0]);

  const [orgs, funds, donors, donations, users] = await Promise.all([
    prisma.organization.count(),
    prisma.fund.count(),
    prisma.donor.count(),
    prisma.donation.count(),
    prisma.user.count(),
  ]);

  console.log("ROW COUNTS:");
  console.log("  organizations:", orgs);
  console.log("  funds        :", funds);
  console.log("  donors       :", donors);
  console.log("  donations    :", donations);
  console.log("  users        :", users);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.log("FAILED ❌");
    console.log(" ", e?.message?.slice(0, 400));
    await prisma.$disconnect();
    process.exit(1);
  });
