import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSuperAdmin, ApiError } from "@/lib/rbac";
import { createOrgAdminSchema } from "@/lib/validations/schemas";
import { canCreatePhoneOnlyOrgAdmin, canProvisionAdminAccount } from "@/lib/auth-session-policy";
import { ensureSameOrigin, isMfaConfigurationReady, normalizeIdentifier } from "@/lib/auth-security";

/**
 * GET /api/users
 * Returns user accounts. Super Admin only; account readiness is exposed through /api/admin/accounts.
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
          phone: true,
          phoneVerifiedAt: true,
          passwordHash: true,
          role: true,
          orgId: true,
          createdAt: true,
          org: { select: { id: true, name: true, slug: true } },
        },
      }),
      prisma.user.count({ where }),
    ]);

    return Response.json({
      data: users.map(({ passwordHash, ...user }) => ({ ...user, passwordless: user.role === "ORG_ADMIN" && passwordHash === null })),
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
    ensureSameOrigin(request);
    const actor = await requireSuperAdmin();

    const body = await request.json();
    const parsed = createOrgAdminSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, phone: suppliedPhone, orgId } = parsed.data;
    const phone = normalizeIdentifier(suppliedPhone);
    if (!/^\+8801[3-9]\d{8}$/.test(phone)) return Response.json({ error: "Enter a valid Bangladesh mobile number." }, { status: 400 });

    // Verify org exists
    const org = await prisma.organization.findUnique({
      where: { id: orgId, deletedAt: null },
      select: { id: true },
    });
    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    const authReady = isMfaConfigurationReady();
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!canProvisionAdminAccount({ actorRole: actor.role, actorOrgId: actor.orgId, targetRole: "ORG_ADMIN", targetOrgId: orgId, targetOrganizationActive: Boolean(org), authenticationReady: authReady }) || !canCreatePhoneOnlyOrgAdmin({ actorRole: actor.role, organizationActive: Boolean(org), phoneAlreadyRegistered: Boolean(existing), authReady })) {
      if (!authReady) return Response.json({ error: "Phone-based account setup is unavailable until authentication and SMS are configured." }, { status: 503 });
      if (!existing) return Response.json({ error: "Org Admin phone provisioning is unavailable." }, { status: 403 });
      return Response.json(
        { error: "An account with this phone number already exists" },
        { status: 409 }
      );
    }
    const internalEmail = `phone-${phone.replace(/\D/g, "")}@phone.invalid`;
    let user;
    try {
      user = await prisma.user.create({
        data: { name, email: internalEmail, phone, phoneVerifiedAt: null, passwordHash: null, role: "ORG_ADMIN", orgId },
        select: { id: true, name: true, phone: true, phoneVerifiedAt: true, role: true, orgId: true, createdAt: true },
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") return Response.json({ error: "An account with this phone number already exists" }, { status: 409 });
      throw error;
    }

    const loginUrl = new URL("/setup", request.nextUrl.origin);
    loginUrl.searchParams.set("phone", phone);
    return Response.json({ data: user, onboardingUrl: loginUrl.toString() }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[POST /api/users]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
