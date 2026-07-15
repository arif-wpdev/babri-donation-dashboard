import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, requireOrgAccess, ApiError } from "@/lib/rbac";
import { createOrgAdminSchema } from "@/lib/validations/schemas";
import bcrypt from "bcryptjs";

/**
 * GET /api/users
 * Returns users. Super Admin sees all; not accessible to Org Admins (use /api/orgs/[orgId] for org-scoped user list).
 */
export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
    const limit = Math.min(100, parseInt(searchParams.get("limit") ?? "20", 10));
    const orgId = searchParams.get("orgId") ?? undefined;

    const where = {
      ...(orgId && { orgId }),
    };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          orgId: true,
          createdAt: true,
          org: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return Response.json({
      data: users,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/users]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/users
 * Creates a new Org Admin for a specific organization (Super Admin only).
 */
export async function POST(request: NextRequest) {
  try {
    await requireSuperAdmin();

    const body = await request.json();
    const parsed = createOrgAdminSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, email, password, orgId } = parsed.data;

    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    // Check email uniqueness
    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      return Response.json(
        { error: "A user with this email already exists" },
        { status: 409 }
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "ORG_ADMIN",
        orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        orgId: true,
        createdAt: true,
      },
    });

    return Response.json({ data: user }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[POST /api/users]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
