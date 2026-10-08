import { redirect } from "next/navigation";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { OrganizationsAdmin } from "@/components/admin/organizations-admin";

export default async function AdminOrganizationsPage() {
  let user;
  try { user = await requireAdminAreaAccess(); } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 423) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 401) redirect("/login?callbackUrl=%2Fadmin%2Forganizations");
    redirect("/dashboard");
  }
  if (user.role !== "SUPER_ADMIN") redirect("/admin");

  const organizations = await prisma.organization.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true, createdAt: true, _count: { select: { users: { where: { role: "ORG_ADMIN" } } } } },
  });

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Organizations</h2>
        <p className="mt-1 text-sm text-muted-foreground">Provision Org Admin access within an active organization. Credentials and hashes are never displayed here.</p>
      </div>
      <OrganizationsAdmin initialOrganizations={organizations.map((organization) => ({ ...organization, createdAt: organization.createdAt.toISOString() }))} />
    </section>
  );
}