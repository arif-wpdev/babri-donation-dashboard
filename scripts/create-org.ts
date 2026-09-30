/**
 * Create the initial Organization for this deployment.
 *
 * WooCommerce consumer credentials are required by the Prisma schema
 * (wcConsumerKey / wcConsumerSecret are non-nullable). They are set here to
 * clearly-marked placeholders so the org can be created before the real keys
 * are known. Replace them from the Settings screen afterwards.
 *
 * Credentials are encrypted with AES-256-GCM using ENCRYPTION_KEY, exactly the
 * same path the settings API uses.
 *
 * Run: npx tsx scripts/create-org.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { encrypt } from "../src/lib/encryption";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const ORG = {
  name: "Babri Masjid Dhaka",
  slug: "babri-masjid-dhaka",
  wcBaseUrl: "https://babrimasjiddhaka.com",
  // Placeholders — must start with ck_ / cs_ to satisfy validation when edited.
  wcConsumerKey: "ck_REPLACE_IN_SETTINGS",
  wcConsumerSecret: "cs_REPLACE_IN_SETTINGS",
  tdfApiKey: "" as string | null,
};

async function main() {
  const existing = await prisma.organization.findUnique({
    where: { slug: ORG.slug },
    select: { id: true, name: true },
  });

  if (existing) {
    console.log(`Organization already exists: ${existing.name} (${existing.id})`);
    return;
  }

  const org = await prisma.organization.create({
    data: {
      name: ORG.name,
      slug: ORG.slug,
      wcBaseUrl: ORG.wcBaseUrl,
      wcConsumerKey: encrypt(ORG.wcConsumerKey),
      wcConsumerSecret: encrypt(ORG.wcConsumerSecret),
      syncEnabled: true,
      syncInterval: 360,
    },
    select: { id: true, name: true, slug: true, wcBaseUrl: true, createdAt: true },
  });

  console.log("Organization created:");
  console.log(`  id       : ${org.id}`);
  console.log(`  name     : ${org.name}`);
  console.log(`  slug     : ${org.slug}`);
  console.log(`  wcBaseUrl: ${org.wcBaseUrl}`);
  console.log("");
  console.log("WooCommerce consumer keys are placeholders — set the real");
  console.log("ck_ / cs_ values from the Settings screen before syncing.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.log("ERROR:", e?.message?.slice(0, 400));
    await prisma.$disconnect();
    process.exit(1);
  });
