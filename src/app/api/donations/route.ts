import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { donationFilterSchema } from "@/lib/validations/schemas";
import type { Prisma } from "@prisma/client";

/**
 * GET /api/donations
 * Returns donations (WC Orders) scoped to the authenticated user's org.
 * Supports filtering by status, fundId, donorId, and date range.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;

    let orgId: string;
    if (user.role === "SUPER_ADMIN") {
      const qOrgId = searchParams.get("orgId");
      if (qOrgId) {
        orgId = qOrgId;
      } else if (user.orgId) {
        orgId = user.orgId;
      } else {
        const firstOrg = await prisma.organization.findFirst();
        if (firstOrg) {
          orgId = firstOrg.id;
        } else {
          return Response.json(
            { error: "Super Admin must provide orgId query parameter" },
            { status: 400 }
          );
        }
      }
    } else {
      if (!user.orgId) {
        return Response.json(
          { error: "User is not associated with an organization" },
          { status: 403 }
        );
      }
      orgId = user.orgId;
    }

    const parsed = donationFilterSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      status: searchParams.get("status") ?? undefined,
      fundId: searchParams.get("fundId") ?? undefined,
      donorId: searchParams.get("donorId") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, status, fundId, donorId, from, to } = parsed.data;

    const where: Prisma.DonationWhereInput = {
      orgId, // ← always scoped
      ...(status && { status }),
      ...(fundId && { fundId }),
      ...(donorId && { donorId }),
      ...(from || to
        ? {
            wcDatePaid: {
              ...(from && { gte: from }),
              ...(to && { lte: to }),
            },
          }
        : {}),
    };

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { wcDateCreated: "desc" },
        select: {
          id: true,
          wcOrderId: true,
          status: true,
          currency: true,
          total: true,
          paymentMethodTitle: true,
          transactionId: true,
          wcDatePaid: true,
          wcDateCreated: true,
          billingSnapshot: true,
          utmSource: true,
          utmMedium: true,
          utmCampaign: true,
          donor: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            },
          },
          fund: {
            select: {
              id: true,
              name: true,
              slug: true,
            },
          },
        },
      }),
      prisma.donation.count({ where }),
    ]);

    // ── Summary stats for the current filter ─────────────────────────────────
    const [summary, uniqueDonorsQuery] = await Promise.all([
      prisma.donation.aggregate({
        where,
        _sum: { total: true },
        _count: { id: true },
      }),
      prisma.donation.findMany({
        where: { ...where, donorId: { not: null } },
        distinct: ['donorId'],
        select: { donorId: true }
      })
    ]);

    return Response.json({
      data: donations,
      summary: {
        totalDonations: summary._count.id,
        totalAmount: summary._sum.total ?? 0,
        uniqueDonors: uniqueDonorsQuery.length,
      },
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/donations]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
