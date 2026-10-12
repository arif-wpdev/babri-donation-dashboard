import { cache } from "react";
import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";
import { requireStrongSession } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { canAccessAdminArea, isStrongAuthSession } from "@/lib/auth-session-policy";

// ─────────────────────────────────────────────────────────────────────────────
// RBAC Helpers for Server Components and Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current session or throws a 401 response.
 * Memoized per server request via React.cache so multiple layout/page calls
 * don't trigger repeated database roundtrips.
 */
export const requireAuth = cache(async () => {
  const session = await auth();
  if (!session?.user || !isStrongAuthSession(session.user, env.AUTH_MFA_ENABLED === "true")) {
    throw new ApiError("Unauthorized", 401);
  }
  if (session.user.authSessionId) {
    try {
      return await requireStrongSession(session.user);
    } catch {
      throw new ApiError("Unauthorized", 401);
    }
  }
  if (env.AUTH_MFA_ENABLED === "true") throw new ApiError("Unauthorized", 401);
  const legacyUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, phone: true, phoneVerifiedAt: true, role: true, orgId: true, disabledAt: true, org: { select: { slug: true, deletedAt: true } } } });
  if (!legacyUser || legacyUser.disabledAt || legacyUser.org?.deletedAt) throw new ApiError("Unauthorized", 401);
  return { ...session.user, name: legacyUser.name, email: legacyUser.email, phone: legacyUser.phoneVerifiedAt ? legacyUser.phone : null, role: legacyUser.role, orgId: legacyUser.orgId, orgSlug: legacyUser.org?.slug ?? null };
});

/**
 * Returns the current session only if the user has one of the allowed roles.
 * Throws 403 otherwise.
 */
export const requireRole = cache(async (...roles: Role[]) => {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new ApiError("Forbidden", 403);
  }
  return user;
});

/**
 * Returns the current session only if the user is a SUPER_ADMIN.
 */
export const requireSuperAdmin = cache(async () => {
  return requireRole("SUPER_ADMIN");
});

/** Returns the current authenticated user only if they can access `/admin`. */
export const requireAdminAreaAccess = cache(async () => {
  const user = await requireAuth();
  if (!canAccessAdminArea(user.role)) throw new ApiError("Forbidden", 403);
  return user;
});

/**
 * Returns the current session only if the user belongs to the specified org
 * OR is a SUPER_ADMIN (who can access any org).
 */
export const requireOrgAccess = cache(async (orgId: string) => {
  const user = await requireAuth();
  if (user.role !== "SUPER_ADMIN" && user.orgId !== orgId) {
    throw new ApiError("Forbidden", 403);
  }
  return user;
});

export const getActiveOrganization = cache(async (orgId: string) => {
  return prisma.organization.findFirst({ where: { id: orgId, deletedAt: null }, select: { id: true, name: true, slug: true } });
});

// ─────────────────────────────────────────────────────────────────────────────
// ApiError — Structured error for Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  public readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
  }
}

/**
 * Wraps a Route Handler function with standardized error handling.
 * Catches ApiError and generic errors and returns proper JSON responses.
 */
export function withErrorHandler<T>(
  handler: () => Promise<T>
): () => Promise<Response> {
  return async () => {
    try {
      const result = await handler();
      return Response.json(result);
    } catch (error) {
      if (error instanceof ApiError) {
        return Response.json(
          { error: error.message },
          { status: error.statusCode }
        );
      }

      console.error("[API Error]", error);
      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  };
}
