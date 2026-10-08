import { redirect } from "next/navigation";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { MobileAppSessionLockedError, MobileAppSessionUnlockRequiredError } from "@/lib/auth-security";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAdminAreaAccess();
  } catch (error) {
    if (error instanceof MobileAppSessionLockedError || error instanceof MobileAppSessionUnlockRequiredError || (error instanceof ApiError && error.statusCode === 423)) {
      redirect("/dashboard");
    }
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    redirect("/login?callbackUrl=%2Fadmin");
  }

  if (user.role === "ORG_ADMIN") {
    const activeOrganization = user.orgId ? await prisma.organization.findFirst({ where: { id: user.orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!activeOrganization) redirect("/dashboard");
  }

  return (
    <main className="min-h-screen bg-muted/30">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-5 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-primary">Administration</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Admin workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage organizations and account access within your authorized scope.</p>
          </div>
          <AdminNavigation role={user.role} />
        </header>
        {children}
      </div>
    </main>
  );
}