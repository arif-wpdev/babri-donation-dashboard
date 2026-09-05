import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // We update any donation where the date is in the future.
    // The '+06:00' bug shifted timestamps 6 hours into the future.
    
    // wcDateCreated
    const res1 = await prisma.$executeRawUnsafe(
      `UPDATE "donations" SET "wcDateCreated" = "wcDateCreated" - interval '6 hours' WHERE "wcDateCreated" > NOW()`
    );

    // wcDatePaid
    const res2 = await prisma.$executeRawUnsafe(
      `UPDATE "donations" SET "wcDatePaid" = "wcDatePaid" - interval '6 hours' WHERE "wcDatePaid" > NOW()`
    );
    
    // wcDateCompleted
    const res3 = await prisma.$executeRawUnsafe(
      `UPDATE "donations" SET "wcDateCompleted" = "wcDateCompleted" - interval '6 hours' WHERE "wcDateCompleted" > NOW()`
    );
    
    // wcDateModified
    const res4 = await prisma.$executeRawUnsafe(
      `UPDATE "donations" SET "wcDateModified" = "wcDateModified" - interval '6 hours' WHERE "wcDateModified" > NOW()`
    );

    // Also update donors that might have a future lastDonationAt
    const res5 = await prisma.$executeRawUnsafe(
      `UPDATE "donors" SET "lastDonationAt" = "lastDonationAt" - interval '6 hours' WHERE "lastDonationAt" > NOW()`
    );

    return NextResponse.json({
      success: true,
      message: "Future dates have been corrected successfully.",
      updated: {
        wcDateCreated: res1,
        wcDatePaid: res2,
        wcDateCompleted: res3,
        wcDateModified: res4,
        donors: res5
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
