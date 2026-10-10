"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OverlayLoader } from "@/components/ui/overlay-loader";

export function RecoveryCodeLogin() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);

  const startRecovery = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: phone, ...(password ? { password } : {}), factor: "recovery" }) });
      const result = await response.json();
      if (!response.ok && response.status === 401 && !passwordRequired) {
        setPasswordRequired(true);
        setError("");
        return;
      }
      if (response.status === 409 && typeof result.error === "string" && result.error.includes("/setup/admin")) {
        setAdminSetupRequired(true);
        throw new Error(result.error);
      }
      if (!response.ok) throw new Error(result.error || "Sign-in could not be started.");
      if (result.next === "legacy-password") throw new Error("This account has no verified phone yet. Complete administrator phone setup first.");
      const codeResponse = await fetch("/api/auth/mfa/recovery/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const codeResult = await codeResponse.json();
      if (!codeResponse.ok) throw new Error(codeResult.error || "Invalid or already-used recovery code.");
      setTicket(codeResult.loginTicket);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery could not be completed.");
    } finally {
      setPending(false);
    }
  };

  const finishLogin = async () => {
    if (!ticket || pending) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loginTicket: ticket, callbackUrl: "/dashboard" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Recovery ticket expired. Restart sign-in.");
      router.replace(result.redirectTo || "/dashboard");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery could not be completed.");
      setTicket("");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <OverlayLoader visible={pending} message="Verifying Recovery Code..." />
      <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline size-4 text-primary" />A recovery code is single-use and replaces the OTP/passkey factor only. Password-secured administrators must still prove their password first.</div>
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {adminSetupRequired && <Link href="/setup/admin" className="block text-center text-sm font-medium text-primary underline">Open administrator phone setup</Link>}
      {!ticket ? <form onSubmit={startRecovery} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="recovery-login-phone">Registered phone</Label><Input id="recovery-login-phone" type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+8801XXXXXXXXX" /></div>
        {passwordRequired && <div className="space-y-2"><Label htmlFor="recovery-login-password">Account password</Label><Input id="recovery-login-password" type="password" autoComplete="current-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div>}
        <div className="space-y-2"><Label htmlFor="recovery-login-code">Unused recovery code</Label><Input id="recovery-login-code" autoComplete="one-time-code" maxLength={64} required value={code} onChange={(event) => setCode(event.target.value)} /></div>
        <Button type="submit" disabled={pending} className="w-full">{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Verify recovery code</Button>
      </form> : <div className="space-y-3"><p className="text-sm text-muted-foreground">Recovery code accepted. Complete sign-in now; this one-time ticket expires shortly.</p><Button type="button" disabled={pending} onClick={() => void finishLogin()} className="w-full">{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Finish sign-in</Button></div>}
      <p className="text-center text-sm text-muted-foreground"><Link href="/login" className="text-primary underline">Return to login</Link></p>
    </div>
  );
}