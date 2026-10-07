import { auth } from "@/lib/auth";
import type { Role } from "@prisma/client";
import { requireStrongSession } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";
import { env } from "@/env";
import { isStrongAuthSession } from "@/lib/auth-session-policy";

// ─────────────────────────────────────────────────────────────────────────────
// RBAC Helpers for Server Components and Route Handlers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current session or throws a 401 response.
 * Use in Route Handlers as a defense-in-depth check (middleware is primary).
 */
export async function requireAuth() {
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
  const legacyUser = await prisma.user.findUnique({ where: { id: session.user.id }, select: { id: true, name: true, email: true, role: true, orgId: true, org: { select: { slug: true, deletedAt: true } } } });
  if (!legacyUser || legacyUser.org?.deletedAt) throw new ApiError("Unauthorized", 401);
  return { ...session.user, name: legacyUser.name, email: legacyUser.email, role: legacyUser.role, orgId: legacyUser.orgId, orgSlug: legacyUser.org?.slug ?? null };
}

/**
 * Returns the current session only if the user has one of the allowed roles.
 * Throws 403 otherwise.
 */
export async function requireRole(...roles: Role[]) {
  const user = await requireAuth();
  if (!roles.includes(user.role)) {
    throw new ApiError("Forbidden", 403);
  }
  return user;
}

/**
 * Returns the current session only if the user is a SUPER_ADMIN.
 */
export async function requireSuperAdmin() {
  return requireRole("SUPER_ADMIN");
}

/**
 * Returns the current session only if the user belongs to the specified org
 * OR is a SUPER_ADMIN (who can access any org).
 */
export async function requireOrgAccess(orgId: string) {
  const user = await requireAuth();
  if (user.role !== "SUPER_ADMIN" && user.orgId !== orgId) {
    throw new ApiError("Forbidden", 403);
  }
  return user;
}

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
