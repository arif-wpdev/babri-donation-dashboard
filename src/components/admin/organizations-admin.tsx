"use client";

import { useState } from "react";
import { Building2, Copy, Loader2, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Organization = { id: string; name: string; slug: string; createdAt: string; _count: { users: number } };

export function OrganizationsAdmin({ initialOrganizations }: { initialOrganizations: Organization[] }) {
  const [organizations, setOrganizations] = useState(initialOrganizations);
  const [orgId, setOrgId] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [pending, setPending] = useState(false);

  // Create Org state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [createPending, setCreatePending] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgWcBaseUrl, setOrgWcBaseUrl] = useState("");
  const [orgWcConsumerKey, setOrgWcConsumerKey] = useState("");
  const [orgWcConsumerSecret, setOrgWcConsumerSecret] = useState("");

  const handleCreateOrg = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setCreatePending(true);
    try {
      const payload = {
        name: orgName,
        slug: orgSlug,
        wcBaseUrl: orgWcBaseUrl,
        wcConsumerKey: orgWcConsumerKey,
        wcConsumerSecret: orgWcConsumerSecret,
      };
      const response = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not create organization");
      }
      
      const newOrg = {
        ...result.data,
        _count: { users: 0 }
      };
      setOrganizations((prev) => [newOrg, ...prev]);
      setIsCreateOpen(false);
      toast.success("Organization created successfully.");
      
      setOrgName("");
      setOrgSlug("");
      setOrgWcBaseUrl("");
      setOrgWcConsumerKey("");
      setOrgWcConsumerSecret("");
      
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create organization");
    } finally {
      setCreatePending(false);
    }
  };

  const provision = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setOnboardingUrl("");
    try {
      const response = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, orgId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not provision Org Admin");
      setOnboardingUrl(result.onboardingUrl);
      setOrganizations((items) => items.map((organization) => organization.id === orgId ? { ...organization, _count: { users: organization._count.users + 1 } } : organization));
      setName("");
      setPhone("");
      toast.success("Org Admin invited. Share the setup link securely.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not provision Org Admin");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)]">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2"><Building2 className="size-5 text-primary" />Active organizations</CardTitle>
            <CardDescription>Organization details and Org Admin counts. Super Admin access is cross-organization.</CardDescription>
          </div>
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger render={<Button size="sm" />}>
              <Plus className="mr-2 size-4" /> Add Org
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Organization</DialogTitle>
                <DialogDescription>
                  Create a new organization and connect its WooCommerce store.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateOrg} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="orgName">Name</Label>
                  <Input id="orgName" required minLength={2} maxLength={100} value={orgName} onChange={(e) => setOrgName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgSlug">Slug</Label>
                  <Input id="orgSlug" required minLength={2} maxLength={50} pattern="[a-z0-9-]+" title="Lowercase alphanumeric with hyphens only" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgWcBaseUrl">WooCommerce Store URL</Label>
                  <Input id="orgWcBaseUrl" type="url" required value={orgWcBaseUrl} onChange={(e) => setOrgWcBaseUrl(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgWcConsumerKey">Consumer Key (ck_...)</Label>
                  <Input id="orgWcConsumerKey" required pattern="ck_.*" value={orgWcConsumerKey} onChange={(e) => setOrgWcConsumerKey(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="orgWcConsumerSecret">Consumer Secret (cs_...)</Label>
                  <Input id="orgWcConsumerSecret" required pattern="cs_.*" value={orgWcConsumerSecret} onChange={(e) => setOrgWcConsumerSecret(e.target.value)} />
                </div>
                <Button type="submit" disabled={createPending} className="w-full">
                  {createPending ? <Loader2 className="mr-2 size-4 animate-spin" /> : "Create Organization"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="space-y-3">
          {organizations.length ? organizations.map((organization) => <div key={organization.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"><div><p className="font-medium">{organization.name}</p><p className="text-sm text-muted-foreground">{organization.slug}</p></div><div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="size-4" />{organization._count.users} admins</div></div>) : <p className="text-sm text-muted-foreground">No active organizations yet.</p>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Invite an Org Admin</CardTitle><CardDescription>Creates a phone-only account scoped to the selected organization. No password is sent or created.</CardDescription></CardHeader>
        <CardContent>
          <form onSubmit={provision} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="admin-org">Organization</Label><select id="admin-org" required value={orgId} onChange={(event) => setOrgId(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="">Choose an organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>
            <div className="space-y-2"><Label htmlFor="admin-name">Full name</Label><Input id="admin-name" minLength={2} maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} /></div>
            <div className="space-y-2"><Label htmlFor="admin-phone">Registered mobile</Label><Input id="admin-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="015XXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
            <Button type="submit" disabled={pending || !orgId || !organizations.length} className="w-full">{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}Create invite</Button>
          </form>
          {onboardingUrl && <div className="mt-5 space-y-2 rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">Setup link created</p><p className="break-all text-xs text-muted-foreground">{onboardingUrl}</p><Button type="button" variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(onboardingUrl).then(() => toast.success("Setup link copied"))}><Copy className="mr-2 size-4" />Copy setup link</Button><p className="text-xs text-muted-foreground">Share it privately with the invitee. Phone verification must match the registered number.</p></div>}
        </CardContent>
      </Card>
    </div>
  );
}