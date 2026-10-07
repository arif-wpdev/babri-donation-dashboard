"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, MonitorSmartphone, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Device = { id: string; credentialId: string; deviceName: string; deviceType: string | null; backedUp: boolean; createdAt: string; lastUsedAt: string | null; revokedAt: string | null };
type Session = { id: string; createdAt: string; lastUsedAt: string; expiresAt: string; isCurrent: boolean };

export function SecuritySettings() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneOtp, setPhoneOtp] = useState("");
  const [phoneResendIn, setPhoneResendIn] = useState(0);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneAttemptsRemaining, setPhoneAttemptsRemaining] = useState(3);

  const refresh = async () => {
    const response = await fetch("/api/auth/mfa/devices", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load security devices");
    const result = await response.json();
    setDevices(result.devices);
    setSessions(result.sessions);
  };

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    Promise.resolve().then(() => fetch("/api/auth/mfa/devices", { cache: "no-store", signal: controller.signal }))
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load security devices");
        return response.json();
      })
      .then((result) => { if (active) { setDevices(result.devices); setSessions(result.sessions); setPhoneVerified(Boolean(result.phoneVerified)); setPhone(result.phone || ""); } })
      .catch((error: unknown) => { if (active && !(error instanceof DOMException && error.name === "AbortError")) toast.error("Could not load security settings"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, []);

  useEffect(() => {
    if (phoneResendIn <= 0) return;
    const timeout = window.setTimeout(() => setPhoneResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timeout);
  }, [phoneResendIn]);

  const registerPasskey = async () => {
    setPending(true);
    try {
      const optionsResponse = await fetch("/api/auth/mfa/passkey/register-options", { method: "POST" });
      const options = await optionsResponse.json();
      if (!optionsResponse.ok) throw new Error(options.error || "Could not start passkey registration");
      const response = await startRegistration(options);
      const result = await fetch("/api/auth/mfa/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response, deviceName: "Passkey" }),
      });
      const body = await result.json();
      if (!result.ok) throw new Error(body.error || "Passkey registration failed");
      toast.success("Passkey registered");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Passkey registration failed");
    } finally {
      setPending(false);
    }
  };

  const revoke = async (data: { credentialId?: string; sessionId?: string }) => {
    const response = await fetch("/api/auth/mfa/devices", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not revoke credential");
    await refresh();
    toast.success("Credential revoked");
  };

  const generateRecoveryCodes = async () => {
    const response = await fetch("/api/auth/mfa/recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", password: confirmPassword }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not create recovery codes");
    setRecoveryCodes(result.recoveryCodes);
    setConfirmPassword("");
    toast.success("Recovery codes created. Save them securely; they are shown only once.");
  };

  const copyRecoveryCodes = async () => {
    await navigator.clipboard.writeText(recoveryCodes.join("\n"));
    toast.success("Recovery codes copied. Store them in a secure place.");
    setRecoveryCodes([]);
  };

  const downloadRecoveryCodes = () => {
    const file = new Blob([recoveryCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "account-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
    setRecoveryCodes([]);
  };

  const requestPhoneCode = async () => {
    const response = await fetch("/api/auth/mfa/phone/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not send SMS code");
    if (result.alreadyVerified) {
      setPhoneVerified(true);
      return;
    }
    setPhoneResendIn(result.resendInSeconds || 60);
    setPhoneAttemptsRemaining(3);
    toast.success("Verification code sent");
  };

  const verifyPhoneCode = async () => {
    const response = await fetch("/api/auth/mfa/phone/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone, otp: phoneOtp }) });
    const result = await response.json();
    if (!response.ok) {
      if (typeof result.attemptsRemaining === "number") setPhoneAttemptsRemaining(result.attemptsRemaining);
      throw new Error(result.error || "Phone verification failed");
    }
    setPhoneOtp("");
    setPhoneVerified(true);
    setPhoneAttemptsRemaining(3);
    setPhoneResendIn(0);
    toast.success("Phone number verified");
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" />Security & trusted devices</CardTitle>
          <CardDescription>Manage passkeys and active sessions. Biometric data stays on your device; this app only stores public-key credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={registerPasskey} disabled={pending || loading}>
            {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Fingerprint className="mr-2 size-4" />}
            Add a passkey
          </Button>
          {loading ? <p className="text-sm text-muted-foreground">Loading…</p> : devices.length === 0 ? <p className="text-sm text-muted-foreground">No passkeys registered.</p> : devices.map((device) => (
            <div key={device.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
              <div><p className="font-medium">{device.deviceName}{device.revokedAt ? " (revoked)" : ""}</p><p className="text-xs text-muted-foreground">Added {new Date(device.createdAt).toLocaleString()} · Last used {device.lastUsedAt ? new Date(device.lastUsedAt).toLocaleString() : "Never"}</p></div>
              {!device.revokedAt && <Button variant="outline" size="sm" onClick={() => void revoke({ credentialId: device.credentialId }).catch((error) => toast.error(error.message))}><Trash2 className="mr-2 size-4" />Revoke</Button>}
            </div>
          ))}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Verified phone for sign-in</CardTitle><CardDescription>Phone login requires a verified E.164 number. OTP delivery uses the configured SMS provider.</CardDescription></CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2"><label htmlFor="auth-phone" className="text-sm font-medium">Phone number {phoneVerified && <span className="text-emerald-700">(verified)</span>}</label><input id="auth-phone" type="tel" inputMode="tel" placeholder="+8801XXXXXXXXX" value={phone} onChange={(event) => { setPhone(event.target.value); setPhoneVerified(false); }} className="h-10 w-full rounded-md border bg-background px-3 text-sm" /></div>
          <Button variant="outline" disabled={!/^\+[1-9]\d{7,14}$/.test(phone) || phoneResendIn > 0 || phoneAttemptsRemaining === 0} onClick={() => void requestPhoneCode().catch((error) => toast.error(error.message))}>{phoneResendIn > 0 ? `Resend in ${phoneResendIn}s` : "Send SMS code"}</Button>
          <input aria-label="Phone verification code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={phoneOtp} onChange={(event) => setPhoneOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className="h-10 rounded-md border bg-background px-3 text-sm" />
          <Button disabled={phoneOtp.length !== 6 || phoneAttemptsRemaining === 0} onClick={() => void verifyPhoneCode().catch((error) => toast.error(error.message))}>Verify phone</Button>
          <span aria-live="polite" className="text-xs text-muted-foreground">{phoneAttemptsRemaining} attempts remaining</span>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Recovery codes</CardTitle><CardDescription>Generate one-time codes for account recovery. They are stored as hashes and displayed only once.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          <input type="password" autoComplete="current-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Confirm your password" className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:max-w-sm" />
          <Button variant="outline" disabled={!confirmPassword || pending} onClick={() => void generateRecoveryCodes().catch((error) => toast.error(error.message))}>Generate new recovery codes</Button>
          {recoveryCodes.length > 0 && <div className="grid grid-cols-2 gap-2 rounded-xl border bg-muted/30 p-4 font-mono text-sm">{recoveryCodes.map((code) => <code key={code}>{code}</code>)}</div>}
          {recoveryCodes.length > 0 && <Button variant="outline" onClick={() => void copyRecoveryCodes().catch(() => toast.error("Could not copy codes"))}>Copy codes</Button>}
          {recoveryCodes.length > 0 && <Button variant="outline" onClick={downloadRecoveryCodes}>Download codes</Button>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><MonitorSmartphone className="size-5" />Active sessions</CardTitle><CardDescription>Revoking a session signs that device out on its next request.</CardDescription></CardHeader>
        <CardContent className="space-y-3">
          {sessions.map((session) => <div key={session.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"><div><p className="font-medium">{session.isCurrent ? "This device" : "Other device"} · Signed in {new Date(session.createdAt).toLocaleString()}</p><p className="text-xs text-muted-foreground">Last activity {new Date(session.lastUsedAt).toLocaleString()}</p></div><Button variant="outline" size="sm" onClick={async () => { await revoke({ sessionId: session.id }); if (session.isCurrent) window.location.assign("/login"); }}><Trash2 className="mr-2 size-4" />Revoke</Button></div>)}
          {!loading && sessions.length === 0 && <p className="text-sm text-muted-foreground">No active sessions found.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
