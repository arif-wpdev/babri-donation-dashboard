"use client";

import { useState } from "react";
import { format } from "date-fns";
import { Building2, Loader2, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type AdminUser = { id: string; name: string | null; phone: string | null; role: string; orgId: string | null; organization: string; createdAt: string; status: string; disabledAt?: string | null; migrationBlockers?: readonly string[]; passwordResetEligible?: boolean; recoveryCodesEligible?: boolean };
const statusLabels: Record<string, string> = { disabled: "Disabled", legacy_password: "Legacy password", legacy_phone_unverified: "Legacy · phone unverified", legacy_passkey_missing: "Legacy · passkey missing", phone_unverified: "Phone unverified", passkey_missing: "Passkey missing", ready_to_migrate: "Ready to migrate", passwordless: "Passwordless" };
const blockerLabels: Record<string, string> = { verified_phone: "verify phone", active_passkey: "add passkey", authentication_configuration: "await authentication setup" };
const recoveryLabels: Record<string, string> = { reset: "Password reset eligible", recoveryCodes: "Recovery codes eligible", setup: "Complete phone/passkey setup" };

export function AdminAccounts({ role, initialUsers, organizations = [] }: { role: string; initialUsers: AdminUser[]; organizations?: { id: string; name: string }[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [onboardingUrl, setOnboardingUrl] = useState("");
  const [orgId, setOrgId] = useState("");
  const superAdmin = role === "SUPER_ADMIN";

  const createEmployee = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPendingUserId("invite");
    try {
      const response = await fetch("/api/team", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, phone, ...(superAdmin ? { orgId } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not invite employee");
      const newUser = result.data;
      const createdUser: AdminUser = { id: newUser.id, name: newUser.name, phone: newUser.phone, role: newUser.role, orgId: newUser.orgId ?? null, organization: organizations.find((organization) => organization.id === newUser.orgId)?.name ?? "Current organization", createdAt: newUser.createdAt, status: "phone_unverified", disabledAt: null };
      if (!superAdmin || createdUser.orgId === orgId) setUsers((current) => [createdUser, ...current]);
      setOnboardingUrl(result.onboardingUrl || "");
      setName("");
      setPhone("");
      setOrgId("");
      toast.success("Employee invited");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not invite employee");
    } finally {
      setPendingUserId(null);
    }
  };

  const setEmployeeDisabled = async (user: AdminUser, disabled: boolean) => {
    if (!superAdmin && user.role !== "ORG_USER") return;
    if (!disabled && !user.disabledAt) return;
    if (!window.confirm(`${disabled ? "Disable" : "Re-enable"} ${user.name || user.phone || "this account"}?`)) return;
    setPendingUserId(user.id);
    try {
      const response = await fetch(`/api/admin/accounts/${user.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ disabled }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not update employee access");
      setUsers((current) => current.map((item) => item.id === user.id ? { ...item, disabledAt: result.data.disabledAt, status: result.data.status, migrationBlockers: result.data.disabledAt ? [] : item.migrationBlockers } : item));
      toast.success(disabled ? "Employee access disabled" : "Employee access re-enabled");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update employee access");
    } finally {
      setPendingUserId(null);
    }
  };

  const permanentlyDeleteAccount = async (user: AdminUser) => {
    if (!superAdmin || !user.disabledAt || user.role === "SUPER_ADMIN") return;
    const confirmation = window.prompt(`Permanently delete ${user.name || user.phone || "this account"}? Type DELETE to confirm. This cannot be undone.`);
    if (confirmation !== "DELETE") return;
    setPendingUserId(user.id);
    try {
      const response = await fetch(`/api/admin/accounts/${user.id}/status`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmation }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not permanently delete account");
      setUsers((current) => current.filter((item) => item.id !== user.id));
      toast.success("Account permanently deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not permanently delete account");
    } finally {
      setPendingUserId(null);
    }
  };

  return (
    <div className="space-y-6">
      {(superAdmin ? organizations.length > 0 : true) && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Plus className="size-5 text-primary" />Invite an employee</CardTitle><CardDescription>{superAdmin ? "Select an active organization; employees are scoped to that tenant." : "Invites are tied to your organization and the supplied registered phone."} The employee will verify the registered phone during first-time setup.</CardDescription></CardHeader><CardContent className="space-y-4"><form onSubmit={createEmployee} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">{superAdmin && <div className="space-y-2 sm:col-span-3"><Label htmlFor="employee-org">Organization</Label><select id="employee-org" required value={orgId} onChange={(event) => setOrgId(event.target.value)} className="h-10 w-full rounded-lg border bg-background px-3 text-sm"><option value="">Choose an organization</option>{organizations.map((organization) => <option key={organization.id} value={organization.id}>{organization.name}</option>)}</select></div>}<div className="space-y-2"><Label htmlFor="employee-name">Full name</Label><Input id="employee-name" minLength={2} maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="employee-phone">Mobile number</Label><Input id="employee-phone" type="tel" inputMode="tel" placeholder="015XXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div><Button type="submit" disabled={pendingUserId !== null || (superAdmin && !orgId)}>{pendingUserId === "invite" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Plus className="mr-2 size-4" />}Invite employee</Button></form>{onboardingUrl && <div className="rounded-xl border border-primary/20 bg-primary/5 p-4"><p className="text-sm font-medium">Employee setup link</p><a href={onboardingUrl} className="mt-1 block break-all text-xs text-primary underline">{onboardingUrl}</a><p className="mt-2 text-xs text-muted-foreground">Share privately. Setup requires OTP to the registered phone and passkey enrollment.</p></div>}</CardContent></Card>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-5 text-primary" />Accounts</CardTitle><CardDescription>{superAdmin ? "Readiness and migration blockers across active organizations." : "Employee access in your active organization."}</CardDescription></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Phone</TableHead>{superAdmin && <TableHead>Organization</TableHead>}<TableHead>Role</TableHead><TableHead>Status / blockers</TableHead>{superAdmin && <TableHead>Recovery</TableHead>}<TableHead>Added</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>{users.length ? users.map((user) => <TableRow key={user.id}><TableCell className="font-medium">{user.name || "—"}</TableCell><TableCell>{user.phone || "—"}</TableCell>{superAdmin && <TableCell><span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5 text-muted-foreground" />{user.organization}</span></TableCell>}<TableCell>{user.role === "SUPER_ADMIN" ? "Super Admin" : user.role === "ORG_ADMIN" ? "Org Admin" : "Employee"}</TableCell><TableCell><div className="space-y-1"><Badge variant="outline">{statusLabels[user.status] ?? user.status}</Badge>{user.migrationBlockers?.length ? <p className="max-w-60 text-xs text-muted-foreground">Next: {user.migrationBlockers.map((blocker) => blockerLabels[blocker] ?? blocker).join(", ")}</p> : null}</div></TableCell>{superAdmin && <TableCell className="text-xs text-muted-foreground">{user.status === "disabled" ? "Unavailable" : user.passwordResetEligible ? recoveryLabels.reset : user.recoveryCodesEligible ? recoveryLabels.recoveryCodes : recoveryLabels.setup}</TableCell>}<TableCell>{format(new Date(user.createdAt), "MMM d, yyyy")}</TableCell><TableCell className="text-right"><div className="flex justify-end gap-2">{superAdmin && user.role !== "SUPER_ADMIN" && <Button variant="outline" size="sm" disabled={pendingUserId !== null} onClick={() => void setEmployeeDisabled(user, !user.disabledAt)}>{pendingUserId === user.id ? <Loader2 className="size-4 animate-spin" /> : user.disabledAt ? "Re-enable" : "Disable"}</Button>}{!superAdmin && user.role === "ORG_USER" && <Button variant="outline" size="sm" disabled={pendingUserId !== null} onClick={() => void setEmployeeDisabled(user, !user.disabledAt)}>{pendingUserId === user.id ? <Loader2 className="size-4 animate-spin" /> : user.disabledAt ? "Re-enable" : "Disable"}</Button>}{superAdmin && user.role !== "SUPER_ADMIN" && user.disabledAt && <Button variant="destructive" size="sm" disabled={pendingUserId !== null} onClick={() => void permanentlyDeleteAccount(user)}><Trash2 className="mr-1 size-4" />Delete</Button>}</div></TableCell></TableRow>) : <TableRow><TableCell colSpan={superAdmin ? 8 : 7} className="h-28 text-center text-muted-foreground">No accounts found.</TableCell></TableRow>}</TableBody></Table></CardContent></Card>
    </div>
  );
}