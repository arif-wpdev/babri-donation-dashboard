import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireStrongSession } from "@/lib/auth-security";
import { MobileAppLock } from "@/components/pwa/mobile-app-lock";
import { enableMobileLockForExistingSession } from "@/lib/mobile-app-lock";
import { MobileAppSessionLockedError } from "@/lib/auth-security";
import { prisma } from "@/lib/prisma";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  try {
    if (session.user.authSessionId) {
      await enableMobileLockForExistingSession({ userId: session.user.id, sessionId: session.user.authSessionId, role: session.user.role });
    }
    await requireStrongSession(session.user);
  } catch (error) {
    if (error instanceof MobileAppSessionLockedError) {
      // Do not render protected server component content behind the lock screen.
      return <MobileAppLock initialLocked />;
    }
    redirect("/login");
  }

  let headerUser: typeof session.user & { phone?: string | null } = session.user;
  if (session.user.role === "ORG_ADMIN") {
    const account = await prisma.user.findUnique({ where: { id: session.user.id }, select: { phone: true, phoneVerifiedAt: true } });
    headerUser = { ...session.user, phone: account?.phoneVerifiedAt ? account.phone : null };
  }

  return (
    <SidebarProvider>
      <MobileAppLock />
      <AppSidebar userRole={session.user.role} />
      <SidebarInset className="bg-background overflow-hidden flex flex-col h-screen">
        <Header user={headerUser} />
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
