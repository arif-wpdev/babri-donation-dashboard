import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validations/schemas";

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

    const parsed = paginationSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsed.success) {
      return Response.json(
        { error: "Invalid query parameters", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { page, limit, search } = parsed.data;

    const where = {
      orgId,
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: "insensitive" as const } },
          { lastName: { contains: search, mode: "insensitive" as const } },
          { email: { contains: search, mode: "insensitive" as const } },
          { phone: { contains: search, mode: "insensitive" as const } },
          { normalizedPhone: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [donors, total] = await Promise.all([
      prisma.donor.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { lastDonationAt: "desc" },
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
            where: { status: "COMPLETED" },
            select: {
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
      data: donors,
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
