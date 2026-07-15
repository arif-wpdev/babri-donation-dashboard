import "dotenv/config";
import { prisma } from "../src/lib/prisma";

async function main() {
  const orgs = await prisma.organization.findMany();
  console.log("Organizations:", orgs);
  
  if (orgs.length === 0) {
    console.log("Creating default organization...");
    const org = await prisma.organization.create({
      data: {
        name: "Default Org",
        slug: "default-org",
        wcBaseUrl: "",
        wcConsumerKey: "",
        wcConsumerSecret: "",
      }
    });
    
    // Assign Super Admin to this org (for testing purposes) so they can use the dashboard
    await prisma.user.updateMany({
      data: { orgId: org.id }
    });
    
    console.log("Assigned users to new Org:", org.id);
  } else {
    // Assign Super Admin to the first org
    await prisma.user.updateMany({
      where: { orgId: null },
      data: { orgId: orgs[0].id }
    });
    console.log("Assigned users without org to first org:", orgs[0].id);
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
