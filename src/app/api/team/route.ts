import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createEmployeeSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(8).max(24),
  password: z.string().min(12).max(256).regex(/[A-Z]/).regex(/[a-z]/).regex(/[0-9]/),
});

function normalizeBangladeshPhone(input: string) {
  const value = input.trim().replace(/[\s().-]/g, "");
  if (/^01[3-9]\d{8}$/.test(value)) return `+88${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  if (/^\+8801[3-9]\d{8}$/.test(value)) return value;
  return null;
}

/**
 * GET /api/team
 * Returns a list of employees for the current organization.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    
    // Only ORG_ADMIN and SUPER_ADMIN can view the team
    if (user.role === "ORG_USER") {
      throw new ApiError("Forbidden", 403);
    }

    let orgId = user.orgId;
    
    // For SUPER_ADMIN without an orgId in a single-org setup, default to the first org
    if (!orgId && user.role === "SUPER_ADMIN") {
      const firstOrg = await prisma.organization.findFirst({
        where: { deletedAt: null },
      });
      if (firstOrg) {
        orgId = firstOrg.id;
      }
    }

    if (!orgId) {
      throw new ApiError("Organization not found", 400);
    }

    const users = await prisma.user.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
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
    const user = await requireAuth();
    
    // Only ORG_ADMIN and SUPER_ADMIN can create employees
    if (user.role === "ORG_USER") {
      throw new ApiError("Forbidden", 403);
    }

    let orgId = user.orgId;
    
    // For SUPER_ADMIN without an orgId in a single-org setup, default to the first org
    if (!orgId && user.role === "SUPER_ADMIN") {
      const firstOrg = await prisma.organization.findFirst({
        where: { deletedAt: null },
      });
      if (firstOrg) {
        orgId = firstOrg.id;
      }
    }

    if (!orgId) {
      throw new ApiError("Organization not found", 400);
    }

    const body = await request.json();
    const parsed = createEmployeeSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Validation failed", issues: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { name, password } = parsed.data;
    const phone = normalizeBangladeshPhone(parsed.data.phone);
    if (!phone) return Response.json({ error: "Enter a valid Bangladeshi mobile number." }, { status: 400 });

    // Phone numbers, not email addresses, identify team login accounts.
    const existing = await prisma.user.findUnique({
      where: { phone },
      select: { id: true },
    });
    if (existing) {
      return Response.json({ error: "An account with this phone number already exists." }, { status: 409 });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    // The legacy Auth.js schema requires email. This reserved placeholder is
    // internal only; the UI and all sign-in flows use the verified phone.
    const internalEmail = `phone-${phone.replace(/\D/g, "")}@phone.invalid`;

    const newUser = await prisma.user.create({
      data: {
        name,
        email: internalEmail,
        phone,
        passwordHash,
        role: "ORG_USER",
        orgId,
      },
      select: {
        id: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    return Response.json({ data: newUser }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) {
      return Response.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[POST /api/team]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
