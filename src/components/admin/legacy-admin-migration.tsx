"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LegacyAdminMigration({ phoneVerified, hasActivePasskey, authenticationReady }: { phoneVerified: boolean; hasActivePasskey: boolean; authenticationReady: boolean }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  const ready = phoneVerified && hasActivePasskey && authenticationReady;

  const migrate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/admin-migration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Account migration could not be completed.");
      setPassword("");
      toast.success("Account migrated. Sign in with your registered phone and passkey or OTP.");
      const { signOut } = await import("next-auth/react");
      await signOut({ redirect: false });
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Account migration could not be completed.";
      setError(message);
      toast.error(message);
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="space-y-4 rounded-xl border p-4" aria-labelledby="legacy-migration-title">
      <div>
        <h3 id="legacy-migration-title" className="flex items-center gap-2 font-semibold"><ShieldCheck className="size-4 text-primary" />Move to phone + passkey sign-in</h3>
        <p className="mt-1 text-sm text-muted-foreground">Migration is optional. Your existing password remains active unless the secure migration succeeds. Success removes the password and revokes existing sessions, so you will need to sign in again.</p>
      </div>
      <ul className="space-y-1 text-sm">
        <li>{phoneVerified ? "✓" : "○"} Verified phone number</li>
        <li>{hasActivePasskey ? "✓" : "○"} Active passkey</li>
        <li>{authenticationReady ? "✓" : "○"} Authentication and SMS configured</li>
      </ul>
      {!phoneVerified && <p className="text-sm text-muted-foreground">Verify your registered phone first in the Security & trusted devices section above.</p>}
      {!hasActivePasskey && <p className="text-sm text-muted-foreground">Register a passkey first in <a className="text-primary underline" href="/dashboard/settings/security">Security settings</a>.</p>}
      {!authenticationReady && <p className="text-sm text-muted-foreground">Migration will become available after an administrator completes MFA, WebAuthn, and SMS configuration.</p>}
      <form onSubmit={migrate} className="space-y-3">
        <div className="space-y-2"><Label htmlFor="legacy-migration-password">Confirm current password</Label><Input id="legacy-migration-password" type="password" autoComplete="current-password" required maxLength={256} value={password} onChange={(event) => setPassword(event.target.value)} disabled={!ready || pending} /></div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" variant="outline" disabled={!ready || pending || !password}>{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Migrate to passwordless sign-in</Button>
      </form>
    </section>
  );
}
