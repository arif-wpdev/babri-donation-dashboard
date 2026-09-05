import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const donations = await prisma.donation.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { donor: true }
  });
  
  console.log("Latest donations in DB:");
  donations.forEach(d => {
    console.log(`Donation ${d.id}:`);
    console.log(` - Donor: ${d.donor?.firstName} ${d.donor?.lastName}`);
    console.log(` - amount: ${d.amount}`);
    console.log(` - wcDateCreated: ${d.wcDateCreated?.toISOString()}`);
    console.log(` - wcDatePaid: ${d.wcDatePaid?.toISOString()}`);
    console.log(` - tdfDonationId: ${d.tdfDonationId}`);
    console.log(` - source: ${d.source}`);
  });
}

main().catch(console.error).finally(() => prisma.$disconnect());
