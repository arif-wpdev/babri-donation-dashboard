import { redirect } from "next/navigation";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { MobileAppSessionLockedError, MobileAppSessionUnlockRequiredError } from "@/lib/auth-security";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { MobileAppLock } from "@/components/pwa/mobile-app-lock";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAdminAreaAccess();
  } catch (error) {
    if (error instanceof MobileAppSessionLockedError || error instanceof MobileAppSessionUnlockRequiredError || (error instanceof ApiError && error.statusCode === 423)) {
      return <MobileAppLock initialLocked />;
    }
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 401) {
      redirect("/login?callbackUrl=%2Fadmin");
    }
    // Do not redirect to /login for server or transient session errors: Proxy
    // may still see an optimistic valid JWT and redirect login back here.
    redirect("/dashboard");
  }

  let headerUser: { id: string; name?: string | null; email?: string | null; role?: string; phone?: string | null } = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  if (user.role === "ORG_ADMIN") {
    const activeOrganization = user.orgId ? await prisma.organization.findFirst({ where: { id: user.orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!activeOrganization) redirect("/dashboard");
    const account = await prisma.user.findUnique({ where: { id: user.id }, select: { phone: true, phoneVerifiedAt: true } });
    headerUser.phone = account?.phoneVerifiedAt ? account.phone : null;
  }

  return (
    <SidebarProvider>
      <MobileAppLock />
      <AppSidebar userRole={user.role} />
      <SidebarInset className="bg-background overflow-hidden flex flex-col h-screen">
        <Header user={headerUser} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-28 md:pb-8 relative bg-muted/20">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
            <header className="flex flex-col gap-4 border-b pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-primary">Administration</p>
                <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Admin workspace</h1>
                <p className="mt-1.5 max-w-2xl text-xs sm:text-sm text-muted-foreground">Manage organizations and account access within your authorized scope.</p>
              </div>
              <AdminNavigation role={user.role} />
            </header>
            {children}
          </div>
        </main>
        <BottomNav userRole={user.role} />
      </SidebarInset>
    </SidebarProvider>
  );
}