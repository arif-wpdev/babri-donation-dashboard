import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ShieldCheck, Users } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";

export default async function AdminHomePage() {
  let user;
  try { user = await requireAdminAreaAccess(); } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 423) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 401) redirect("/login?callbackUrl=%2Fadmin");
    redirect("/dashboard");
  }
  if (user.role === "SUPER_ADMIN") redirect("/admin/organizations");
  const activeOrganization = user.orgId ? await prisma.organization.findFirst({ where: { id: user.orgId, deletedAt: null }, select: { id: true } }) : null;
  if (!activeOrganization) redirect("/dashboard");

  return (
    <section className="grid gap-4 md:grid-cols-2">
      <Link href="/admin/accounts" className="group">
        <Card className="h-full transition-colors group-hover:ring-primary/30">
          <CardHeader><Users className="mb-2 size-6 text-primary" /><CardTitle>Team accounts</CardTitle><CardDescription>Invite employees and review sign-in readiness for your organization.</CardDescription></CardHeader>
          <CardContent><span className="text-sm font-medium text-primary">Manage team →</span></CardContent>
        </Card>
      </Link>
      <Card className="h-full">
        <CardHeader><ShieldCheck className="mb-2 size-6 text-primary" /><CardTitle>Organization scope</CardTitle><CardDescription>As an Org Admin, account management is restricted to your active organization. Super Admin tools are not available here.</CardDescription></CardHeader>
      </Card>
      <Link href="/admin/security" className="group">
        <Card className="h-full transition-colors group-hover:ring-primary/30">
          <CardHeader><Building2 className="mb-2 size-6 text-primary" /><CardTitle>Security and setup</CardTitle><CardDescription>Manage administrator account setup guidance and personal security settings.</CardDescription></CardHeader>
          <CardContent><span className="text-sm font-medium text-primary">Open security →</span></CardContent>
        </Card>
      </Link>
    </section>
  );
}