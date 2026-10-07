import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireStrongSession } from "@/lib/auth-security";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  try {
    await requireStrongSession(session.user);
  } catch {
    redirect("/login");
  }

  return (
    <SidebarProvider>
      <AppSidebar userRole={session.user.role} />
      <SidebarInset className="bg-background overflow-hidden flex flex-col h-screen">
        <Header user={session.user} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-24 md:pb-8 relative">
          <div className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
        <BottomNav />
      </SidebarInset>
    </SidebarProvider>
  );
}
