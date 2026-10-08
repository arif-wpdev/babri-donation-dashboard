import { redirect } from "next/navigation";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { isMfaConfigurationReady } from "@/lib/auth-security";
import { canManageAdminOrganization, canViewAdminAccounts, getAdminAccountStatusDetails, getRecoveryReadiness } from "@/lib/auth-session-policy";
import { AdminAccounts } from "@/components/admin/admin-accounts";

export default async function AdminAccountsPage() {
  let user;
  try { user = await requireAdminAreaAccess(); } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 423) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 401) redirect("/login?callbackUrl=%2Fadmin%2Faccounts");
    redirect("/dashboard");
  }
  if (user.role === "ORG_ADMIN") {
    const activeOrganization = user.orgId ? await prisma.organization.findFirst({ where: { id: user.orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!activeOrganization) redirect("/dashboard");
  }

  const users = await prisma.user.findMany({
    where: user.role === "SUPER_ADMIN"
      ? { role: { in: ["ORG_ADMIN", "ORG_USER"] }, orgId: { not: null }, org: { deletedAt: null } }
      : { role: "ORG_USER", orgId: user.orgId!, org: { deletedAt: null } },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, phone: true, phoneVerifiedAt: true, passwordHash: true, disabledAt: true, role: true, orgId: true, createdAt: true, org: { select: { name: true, deletedAt: true } }, webAuthnCredentials: { where: { revokedAt: null }, select: { id: true }, take: 1 } },
  });
  const scopedUsers = users.filter((account) => canViewAdminAccounts(user.role, account.role) && (user.role === "SUPER_ADMIN" || Boolean(account.orgId && canManageAdminOrganization({ actorRole: user.role, actorOrgId: user.orgId, targetOrgId: account.orgId, targetOrganizationActive: !account.org?.deletedAt }))));
  const outstandingLegacyAccounts = user.role === "SUPER_ADMIN" ? await prisma.user.count({ where: { role: "ORG_ADMIN", passwordHash: { not: null }, disabledAt: null, orgId: { not: null }, org: { deletedAt: null } } }) : 0;
  const organizations = user.role === "SUPER_ADMIN"
    ? await prisma.organization.findMany({ where: { deletedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } })
    : [];

  return (
    <section className="space-y-6">
      <div><h2 className="text-2xl font-semibold tracking-tight">{user.role === "SUPER_ADMIN" ? "Account readiness" : "Team accounts"}</h2><p className="mt-1 text-sm text-muted-foreground">{user.role === "SUPER_ADMIN" ? "Review role and setup state across active organizations; no password hashes or secrets are returned." : "Manage employee accounts in your organization. Org Admin accounts and other organizations are not visible here."}</p></div>
      {user.role === "SUPER_ADMIN" && <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{outstandingLegacyAccounts} active legacy Org Admin account{outstandingLegacyAccounts === 1 ? "" : "s"} remain. Do not retire legacy login or recovery until owners complete migration or approve exemptions, and recovery has been exercised.</p>}
      {user.role === "SUPER_ADMIN" && <p className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">{outstandingLegacyAccounts} active legacy Org Admin account{outstandingLegacyAccounts === 1 ? "" : "s"} remain. Do not retire legacy login or recovery until account owners have migrated or been explicitly exempted and recovery has been exercised.</p>}
      <AdminAccounts
        role={user.role}
        organizations={organizations}
        initialUsers={scopedUsers.map((account) => ({ id: account.id, name: account.name, phone: account.phone, role: account.role, orgId: account.orgId, organization: account.org?.name ?? "—", createdAt: account.createdAt.toISOString(), disabledAt: account.disabledAt?.toISOString() ?? null, ...getAdminAccountStatusDetails({ role: account.role, passwordHash: account.passwordHash, phoneVerifiedAt: account.phoneVerifiedAt, hasActivePasskey: account.webAuthnCredentials.length > 0, authenticationReady: isMfaConfigurationReady(), disabledAt: account.disabledAt }), ...getRecoveryReadiness({ role: account.role, passwordHash: account.passwordHash, phoneVerifiedAt: account.phoneVerifiedAt, hasActivePasskey: account.webAuthnCredentials.length > 0 }) }))}
      />
    </section>
  );
}