import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  console.log('Starting cleanup of cancelled/failed donations...');

  const result = await prisma.donation.deleteMany({
    where: {
      status: {
        notIn: ['COMPLETED', 'PROCESSING'],
      },
    },
  });

  console.log(`Deleted ${result.count} cancelled/failed/pending donations from the database.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
