import { type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt } from "@/lib/encryption";
import { requireSuperAdmin, ApiError } from "@/lib/rbac";
import { createOrgSchema } from "@/lib/validations/schemas";

/**
 * GET /api/orgs
 * Returns all organizations (Super Admin only).
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
    const search = searchParams.get("search") ?? undefined;

    const where = {
      deletedAt: null,
      ...(search && {
        OR: [
          { name: { contains: search, mode: "insensitive" as const } },
          { slug: { contains: search, mode: "insensitive" as const } },
        ],
      }),
    };

    const [organizations, total] = await Promise.all([
      prisma.organization.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          slug: true,
          logoUrl: true,
          wcBaseUrl: true,
          syncEnabled: true,
          syncInterval: true,
          lastSyncedAt: true,
          createdAt: true,
          _count: {
            select: {
              users: true,
              funds: true,
              donors: true,
              donations: true,
            },
          },
        },
      }),
      prisma.organization.count({ where }),
    ]);

    return Response.json({
      data: organizations,
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
    console.error("[GET /api/orgs]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/orgs
 * Creates a new organization (Super Admin only).
 * Encrypts WooCommerce credentials before storing.
 */
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const parsed = createOrgSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      name,
      slug,
      logoUrl,
      wcBaseUrl,
      wcConsumerKey,
      wcConsumerSecret,
      syncEnabled,
      syncInterval,
    } = parsed.data;

    // Check slug uniqueness
    const existing = await prisma.organization.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing) {
      return Response.json(
        { error: "An organization with this slug already exists" },
        { status: 409 }
      );
    }

    // Encrypt WooCommerce credentials before storing
    const encryptedKey = encrypt(wcConsumerKey);
    const encryptedSecret = encrypt(wcConsumerSecret);

    const org = await prisma.organization.create({
      data: {
        name,
        slug,
        logoUrl: logoUrl || null,
        wcBaseUrl,
        wcConsumerKey: encryptedKey,
        wcConsumerSecret: encryptedSecret,
        syncEnabled,
        syncInterval,
      },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        wcBaseUrl: true,
        syncEnabled: true,
        syncInterval: true,
        createdAt: true,
      },
    });

    return Response.json({ data: org }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[POST /api/orgs]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
