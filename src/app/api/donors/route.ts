import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { donorFilterSchema } from "@/lib/validations/schemas";
import type { Prisma } from "@prisma/client";
import { getDonorDonationDateBounds, matchesPeriodDonationFilters } from "@/lib/donor-date-filter";

/**
 * GET /api/donors
 * Returns donors (WC Customers) scoped to the authenticated user's org.
 * SUPER_ADMIN must provide ?orgId= query param.
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

    const parsed = donorFilterSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      minAmount: searchParams.get("minAmount") ?? undefined,
      maxAmount: searchParams.get("maxAmount") ?? undefined,
      minCount: searchParams.get("minCount") ?? undefined,
      maxCount: searchParams.get("maxCount") ?? undefined,
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
      sortBy: searchParams.get("sortBy") ?? undefined,
      sortOrder: searchParams.get("sortOrder") ?? undefined,
      fundId: searchParams.get("fundId") ?? undefined,
    });

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, search, minAmount, maxAmount, minCount, maxCount, from, to, sortBy, sortOrder, fundId } = parsed.data;
    const { gte: dateFrom, lt: dateToExclusive } = getDonorDonationDateBounds(from, to);

    const datedDonationWhere: Prisma.DonationWhereInput = {
      status: "COMPLETED",
      wcDatePaid: {
        ...(dateFrom && { gte: dateFrom }),
        ...(dateToExclusive && { lt: dateToExclusive }),
      },
      ...(fundId && { fundId }),
    };

    let donorIdsForDateRange: string[] | undefined;
    let periodTotalsByDonor: Map<string, { amount: number; count: number }> | undefined;
    if (from || to) {
      const periodTotals = await prisma.donation.groupBy({
        by: ["donorId"],
        where: { orgId, donorId: { not: null }, ...datedDonationWhere },
        _sum: { total: true },
        _count: { _all: true },
      });
      periodTotalsByDonor = new Map(
        periodTotals.flatMap((total) => total.donorId
          ? [[total.donorId, { amount: Number(total._sum.total ?? 0), count: total._count._all }] as const]
          : []),
      );
      donorIdsForDateRange = periodTotals
        .filter((total) => total.donorId && matchesPeriodDonationFilters({
          total: Number(total._sum.total ?? 0),
          count: total._count._all,
          minAmount,
          maxAmount,
          minCount,
          maxCount,
        }))
        .flatMap((total) => total.donorId ? [total.donorId] : []);
    }

    const where: Prisma.DonorWhereInput = {
      orgId,
      ...(donorIdsForDateRange ? { id: { in: donorIdsForDateRange } } : {}),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" } },
          { lastName: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
          { normalizedPhone: { contains: search, mode: "insensitive" } },
        ],
      }),
      ...( !(from || to) && (minAmount !== undefined || maxAmount !== undefined) && {
        totalSpent: {
          ...(minAmount !== undefined && { gte: minAmount }),
          ...(maxAmount !== undefined && { lte: maxAmount }),
        },
      }),
      ...( !(from || to) && (minCount !== undefined || maxCount !== undefined) && {
        ordersCount: {
          ...(minCount !== undefined && { gte: minCount }),
          ...(maxCount !== undefined && { lte: maxCount }),
        },
      }),
      ...(!(from || to) && fundId && { donations: { some: { fundId, status: "COMPLETED" } } }),
    };

    let orderByClause: Prisma.DonorOrderByWithRelationInput = {};
    if (sortBy === "totalSpent") {
      orderByClause = { totalSpent: sortOrder };
    } else if (sortBy === "ordersCount") {
      orderByClause = { ordersCount: sortOrder };
    } else {
      orderByClause = { lastDonationAt: { sort: sortOrder, nulls: 'last' } as any };
    }

    const [donors, total] = await Promise.all([
      prisma.donor.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: orderByClause,
        select: {
          id: true,
          wcCustomerId: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          normalizedPhone: true,
          avatarUrl: true,
          totalSpent: true,
          ordersCount: true,
          isPayingCustomer: true,
          lastDonationAt: true,
          wcDateCreated: true,
          syncedAt: true,
          _count: { select: { donations: true } },
          donations: {
            take: 1,
            orderBy: { wcDatePaid: "desc" },
            where: datedDonationWhere,
            select: {
              utmSource: true,
              utmCampaign: true,
              wcDatePaid: true,
              fund: {
                select: {
                  name: true
                }
              }
            }
          }
        },
      }),
      prisma.donor.count({ where }),
    ]);

    return Response.json({
      data: donors.map((donor) => {
        const periodTotals = periodTotalsByDonor?.get(donor.id);
        return periodTotals ? { ...donor, periodDonationTotal: periodTotals.amount, periodDonationCount: periodTotals.count } : donor;
      }),
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
    console.error("[GET /api/donors]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
