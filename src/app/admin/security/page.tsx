import { redirect } from "next/navigation";
import Link from "next/link";
import { ApiError, requireAdminAreaAccess } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { SecuritySettings } from "@/components/settings/security-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AdminSecurityPage() {
  let user;
  try { user = await requireAdminAreaAccess(); } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403) redirect("/dashboard");
    if (error instanceof ApiError && error.statusCode === 423) redirect("/dashboard");
    redirect("/login?callbackUrl=%2Fadmin%2Fsecurity");
  }
  if (user.role === "ORG_ADMIN") {
    const activeOrganization = user.orgId ? await prisma.organization.findFirst({ where: { id: user.orgId, deletedAt: null }, select: { id: true } }) : null;
    if (!activeOrganization) redirect("/dashboard");
  }

  return (
    <section className="mx-auto w-full max-w-3xl space-y-6">
      <div><h2 className="text-2xl font-semibold tracking-tight">Security & account setup</h2><p className="mt-1 text-sm text-muted-foreground">Setup and recovery are separated from everyday login. Super Admin account bootstrap stays distinct from employee and phone-only Org Admin enrollment.</p></div>
      {user.role === "SUPER_ADMIN" && <Card><CardHeader><CardTitle>Administrator security</CardTitle><CardDescription>Manage personal passkeys, verified phone, recovery codes, and active sessions.</CardDescription></CardHeader><CardContent><Link className="text-sm font-medium text-primary underline" href="/dashboard/settings/security">Open security settings</Link><span className="mx-2 text-muted-foreground">·</span><Link className="text-sm font-medium text-primary underline" href="/setup/admin">Phone bootstrap</Link></CardContent></Card>}
      {user.role === "ORG_ADMIN" && <SecuritySettings />}
    </section>
  );
}