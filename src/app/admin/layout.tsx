import { redirect } from "next/navigation";
import { ApiError, getActiveOrganization, requireAdminAreaAccess } from "@/lib/rbac";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  let user;
  try {
    user = await requireAdminAreaAccess();
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 401) {
      redirect("/login?callbackUrl=%2Fadmin");
    }
    redirect("/dashboard");
  }

  let headerUser: { id: string; name?: string | null; email?: string | null; role?: string; phone?: string | null } = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  };

  if (user.role === "ORG_ADMIN") {
    const activeOrganization = user.orgId ? await getActiveOrganization(user.orgId) : null;
    if (!activeOrganization) redirect("/dashboard");
    headerUser.phone = user.phone ?? null;
  }

  return (
    <SidebarProvider>
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