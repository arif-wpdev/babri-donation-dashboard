import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireAuth();
    const donorId = (await params).id;

    const donor = await prisma.donor.findUnique({
      where: { id: donorId },
      select: {
        id: true,
        wcCustomerId: true,
        orgId: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        normalizedPhone: true,
        avatarUrl: true,
        billingAddress: true,
        shippingAddress: true,
        totalSpent: true,
        ordersCount: true,
        isPayingCustomer: true,
        lastDonationAt: true,
        wcDateCreated: true,
        syncedAt: true,
      },
    });

    if (!donor) {
      return Response.json({ error: "Donor not found" }, { status: 404 });
    }

    // Ensure user has access to this org
    if (user.role !== "SUPER_ADMIN" && donor.orgId !== user.orgId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    return Response.json({ data: donor });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/donors/[id]]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
