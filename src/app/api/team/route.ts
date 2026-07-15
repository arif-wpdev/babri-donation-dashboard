import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import bcrypt from "bcryptjs";
import { z } from "zod";

const createEmployeeSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});

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
        email: true,
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

    const { name, email, password } = parsed.data;

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

    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: "ORG_USER",
        orgId,
      },
      select: {
        id: true,
        name: true,
        email: true,
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
