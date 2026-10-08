import { prisma } from "@/lib/prisma";
import { requireAdminAreaAccess, ApiError } from "@/lib/rbac";
import { canManageAdminOrganization, canViewAdminAccounts, getAdminAccountStatusDetails, getRecoveryReadiness, canRetireLegacyAuthentication } from "@/lib/auth-session-policy";
import { isMfaConfigurationReady } from "@/lib/auth-security";

export async function GET() {
  try {
    const actor = await requireAdminAreaAccess();
    if (actor.role === "ORG_ADMIN" && !actor.orgId) return Response.json({ error: "Organization not found" }, { status: 403 });
    const activeOrganization = actor.role === "ORG_ADMIN" ? await prisma.organization.findFirst({ where: { id: actor.orgId!, deletedAt: null }, select: { id: true } }) : null;
    if (actor.role === "ORG_ADMIN" && !activeOrganization) return Response.json({ error: "Organization not found" }, { status: 403 });

    const users = await prisma.user.findMany({
      where: actor.role === "SUPER_ADMIN"
        ? { role: { in: ["ORG_ADMIN", "ORG_USER"] }, orgId: { not: null }, org: { deletedAt: null } }
        : { role: "ORG_USER", orgId: actor.orgId!, org: { deletedAt: null } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, phone: true, phoneVerifiedAt: true, passwordHash: true, disabledAt: true, role: true, orgId: true, createdAt: true, org: { select: { name: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
    });

    const data = users
      .filter((user) => canViewAdminAccounts(actor.role, user.role) && (actor.role === "SUPER_ADMIN" || Boolean(user.orgId && canManageAdminOrganization({ actorRole: actor.role, actorOrgId: actor.orgId, targetOrgId: user.orgId, targetOrganizationActive: true }))))
      .map((user) => ({
        id: user.id,
        name: user.name,
        phone: user.phone,
        role: user.role,
        orgId: user.orgId,
        organization: user.org?.name ?? "—",
        createdAt: user.createdAt,
        ...getAdminAccountStatusDetails({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt, hasActivePasskey: user.webAuthnCredentials.length > 0, authenticationReady: isMfaConfigurationReady(), disabledAt: user.disabledAt }),
        ...getRecoveryReadiness({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt, hasActivePasskey: user.webAuthnCredentials.length > 0 }),
        disabledAt: user.disabledAt,
      }));

    const outstandingLegacyAccounts = users.filter((user) => user.role === "ORG_ADMIN" && user.passwordHash !== null && !user.disabledAt).length;
    return Response.json({ data, meta: { outstandingLegacyAccounts, retirementReady: canRetireLegacyAuthentication({ outstandingLegacyAccounts, ownerConfirmedExemptions: 0, recoveryExerciseComplete: false }) } });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[GET /api/admin/accounts]", error);
    return Response.json({ error: "Could not load accounts" }, { status: 500 });
  }
}
