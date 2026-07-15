import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgAccess, ApiError } from "@/lib/rbac";

/**
 * GET /api/orgs/[orgId]
 * Returns organization details.
 * Accessible by: SUPER_ADMIN (any org), ORG_ADMIN (own org only).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;
    await requireOrgAccess(orgId);

    const org = await prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        wcBaseUrl: true,
        // Never return wcConsumerKey / wcConsumerSecret to the client
        syncEnabled: true,
        syncInterval: true,
        lastSyncedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            funds: true,
            donors: true,
            donations: true,
          },
        },
        syncLogs: {
          take: 5,
          orderBy: { startedAt: "desc" },
          select: {
            id: true,
            status: true,
            triggeredBy: true,
            fundsAdded: true,
            fundsUpdated: true,
            donorsAdded: true,
            donorsUpdated: true,
            donationsAdded: true,
            donationsUpdated: true,
            error: true,
            startedAt: true,
            completedAt: true,
          },
        },
      },
    });

    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    return Response.json({ data: org });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/orgs/[orgId]]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
