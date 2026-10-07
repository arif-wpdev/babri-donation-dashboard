"use client";

import { useState } from "react";
import { Loader2, Phone, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function EmployeePhoneSetup() {
  const [step, setStep] = useState<"credentials" | "code" | "done">("credentials");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canonicalPhone = phone.replace(/[\s().-]/g, "").replace(/^01([3-9]\d{8})$/, "+8801$1").replace(/^880(1[3-9]\d{8})$/, "+880$1");

  const sendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/employee-phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonicalPhone, password }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not send verification code");
      setStep("code");
      toast.success(result.message || "Verification code sent.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send verification code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/employee-phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: canonicalPhone, password, otp }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
        throw new Error(result.error || "Phone verification failed");
      }
      setPassword("");
      setOtp("");
      setStep("done");
      toast.success("Phone verified. You can now sign in.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Phone verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 w-full border-t pt-5" aria-labelledby="employee-phone-setup-title">
      <div className="mb-3 flex items-center gap-2"><Phone className="size-4 text-primary" /><h2 id="employee-phone-setup-title" className="text-sm font-semibold">New employee: verify invited phone</h2></div>
      <p className="mb-4 text-xs text-muted-foreground">Use the mobile number and temporary password provided by your administrator. Verify the number before signing in.</p>
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}
      {step === "done" ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck className="mr-2 inline size-4" />Phone verified. Sign in with your phone and password above.</div>
      ) : step === "credentials" ? (
        <form onSubmit={sendCode} className="flex flex-col gap-3">
          <div className="space-y-1.5"><Label htmlFor="employee-bootstrap-phone">Invited mobile number</Label><Input id="employee-bootstrap-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="015XXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="employee-bootstrap-password">Temporary password</Label><Input id="employee-bootstrap-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <Button type="submit" variant="outline" disabled={busy || !/^\+8801[3-9]\d{8}$/.test(canonicalPhone)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Send SMS code</Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {canonicalPhone.replace(/^(.{3}).*(.{3})$/, "$1••••••$2")}.</p>
          <div className="space-y-1.5"><Label htmlFor="employee-bootstrap-code">SMS verification code</Label><Input id="employee-bootstrap-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <p aria-live="polite" className="text-xs text-muted-foreground">{attemptsRemaining} attempts remaining. Code expires in 5 minutes.</p>
          <Button type="submit" variant="outline" disabled={busy || otp.length !== 6 || attemptsRemaining === 0}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Verify phone</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setStep("credentials"); setOtp(""); setError(""); }}>Back</Button>
        </form>
      )}
    </section>
  );
}
