/**
 * Remove a user account by email. Read-write: deletes the row.
 *
 * Cascades through the schema's onDelete rules, so related donations or
 * team links owned by that user go with it.
 *
 * Run: npx tsx scripts/delete-user.ts <email>
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.log("usage: npx tsx scripts/delete-user.ts <email>");
    return;
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, role: true, orgId: true },
  });

  if (!user) {
    console.log(`No user with email ${email}`);
    return;
  }

  console.log(`deleting: ${user.email}  role=${user.role}  org=${user.orgId ?? "null"}`);
  await prisma.user.delete({ where: { id: user.id } });

  const remaining = await prisma.user.findMany({ select: { email: true, role: true } });
  console.log(`deleted. remaining users: ${remaining.length}`);
  for (const u of remaining) {
    console.log(`  ${u.email}  role=${u.role}`);
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.log("ERROR:", e?.message?.slice(0, 400));
    await prisma.$disconnect();
    process.exit(1);
  });
