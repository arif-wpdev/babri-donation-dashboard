import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { z } from "zod";
import { canAccessAdminArea, canProvisionAdminAccount, isPhoneOnlyEmployeeInviteAllowed } from "@/lib/auth-session-policy";
import { normalizeBangladeshMobile } from "@/lib/bangladesh-phone";
import { ensureSameOrigin, isMfaConfigurationReady } from "@/lib/auth-security";

const createEmployeeSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().min(8).max(24),
  orgId: z.string().min(1).max(64).optional(),
}).strict();
const teamQuerySchema = z.object({ orgId: z.string().min(1).max(64).optional() }).strict();

/**
 * GET /api/team
 * Returns a list of employees for the current organization.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    // Only ORG_ADMIN and SUPER_ADMIN can view the team
    if (!canAccessAdminArea(user.role)) {
      throw new ApiError("Forbidden", 403);
    }

    let orgId = user.orgId;
    const query = teamQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    const requestedOrgId = user.role === "SUPER_ADMIN" && query.success ? query.data.orgId : null;
    if (requestedOrgId) orgId = requestedOrgId;

    const activeOrganization = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!orgId || !activeOrganization || (user.role === "ORG_ADMIN" && orgId !== user.orgId)) {
      throw new ApiError(user.role === "SUPER_ADMIN" ? "Select an active organization" : "Organization not found", user.role === "SUPER_ADMIN" ? 400 : 403);
    }

    const users = await prisma.user.findMany({
      where: { orgId },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    return Response.json({ data: users });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[GET /api/team]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/team
 * Creates a new ORG_USER employee account.
 */
export async function POST(request: NextRequest) {
  try {
    ensureSameOrigin(request);
    const user = await requireAuth();
    
    // Only ORG_ADMIN and SUPER_ADMIN can create employees
    if (!canAccessAdminArea(user.role)) {
      throw new ApiError("Forbidden", 403);
    }

    const body = await request.json().catch(() => null);
    const parsed = createEmployeeSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }
    const orgId = user.role === "ORG_ADMIN" ? user.orgId : parsed.data.orgId ?? null;

    const activeOrganization = orgId ? await prisma.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!orgId || !activeOrganization) {
      throw new ApiError(user.role === "SUPER_ADMIN" ? "Select an active organization" : "Organization not found", user.role === "SUPER_ADMIN" ? 400 : 403);
    }
    if (!canProvisionAdminAccount({ actorRole: user.role, actorOrgId: user.orgId, targetRole: "ORG_USER", targetOrgId: orgId, targetOrganizationActive: true })) {
      throw new ApiError("Forbidden", 403);
    }
    if (user.role === "SUPER_ADMIN" && !isMfaConfigurationReady()) {
      return Response.json({ error: "Employee phone onboarding is unavailable until MFA and SMS are configured." }, { status: 503 });
    }

    const { name } = parsed.data;
    const phone = normalizeBangladeshMobile(parsed.data.phone);
    if (!phone) return Response.json({ error: "Enter a valid Bangladeshi mobile number." }, { status: 400 });

    // Phone numbers, not email addresses, identify team login accounts.
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (!isPhoneOnlyEmployeeInviteAllowed({ role: user.role, phoneAlreadyRegistered: Boolean(existing) })) {
      if (existing) return Response.json({ error: "An account with this phone number already exists." }, { status: 409 });
      throw new ApiError("Forbidden", 403);
    }

    // Auth.js still requires a unique email column. Use an internal reserved
    // placeholder; employee-facing UI and authentication use phone only.
    const internalEmail = `phone-${phone.replace(/\D/g, "")}@phone.invalid`;
    let newUser;
    try {
      newUser = await prisma.user.create({
        data: {
          name,
          email: internalEmail,
          phone,
          phoneVerifiedAt: null,
          passwordHash: null,
          role: "ORG_USER",
          orgId,
        },
        select: {
          id: true,
          name: true,
          phone: true,
          role: true,
          orgId: true,
          createdAt: true,
        },
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        return Response.json({ error: "An account with this phone number already exists." }, { status: 409 });
      }
      throw error;
    }

    const onboardingUrl = new URL("/setup", request.nextUrl.origin);
    onboardingUrl.searchParams.set("phone", phone);
    return Response.json({ data: newUser, onboardingUrl: onboardingUrl.toString() }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[POST /api/team]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
