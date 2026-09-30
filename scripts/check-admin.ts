/**
 * Verify the seeded super admin can authenticate: confirms the stored bcrypt
 * hash matches the configured password. Read-only. Prints no secrets.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is not set");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;

  console.log("configured email:", email);
  console.log("password length :", password ? password.length : "(not set)");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, orgId: true, passwordHash: true },
  });

  if (!user) {
    console.log("RESULT: user NOT FOUND in database");
    const all = await prisma.user.findMany({ select: { email: true, role: true } });
    console.log("users present:", all);
    return;
  }

  console.log("found user    :", user.email, "| role:", user.role, "| orgId:", user.orgId);
  console.log("hash present  :", !!user.passwordHash, "| length:", user.passwordHash?.length ?? 0);

  if (!user.passwordHash) {
    console.log("RESULT: user has NO passwordHash -> cannot sign in with password");
    return;
  }

  const valid = await bcrypt.compare(password ?? "", user.passwordHash);
  console.log("password match:", valid ? "YES ✅" : "NO ❌");
  console.log("RESULT:", valid ? "login should work" : "password does not match stored hash");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.log("ERROR:", e?.message?.slice(0, 300));
    await prisma.$disconnect();
  });
