"use client";

import { useState } from "react";
import { Loader2, Phone, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export function SuperAdminPhoneSetup() {
  const [step, setStep] = useState<"credentials" | "otp" | "done">("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const canonicalPhone = phone.replace(/[\s().-]/g, "").replace(/^01([3-9]\d{8})$/, "+8801$1").replace(/^880(1[3-9]\d{8})$/, "+880$1");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);

  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/bootstrap-phone/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, phone: canonicalPhone }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not request phone verification");
      setStep("otp");
      toast.success("If eligible, an SMS verification code has been sent.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not request phone verification");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/bootstrap-phone/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, phone, otp }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
        throw new Error(result.error || "Phone verification failed");
      }
      setStep("done");
      setPassword("");
      setOtp("");
      toast.success("Phone verified. Sign in using the phone number above.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Phone verification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 w-full border-t pt-5" aria-labelledby="admin-phone-setup-title">
      <div className="mb-3 flex items-center gap-2">
        <Phone className="size-4 text-primary" />
        <h2 id="admin-phone-setup-title" className="text-sm font-semibold">Super Admin: verify sign-in phone</h2>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        One-time setup for an unverified Super Admin account. Email is used only to identify the admin for this setup; future sign-in uses phone number.
      </p>

      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}
      {step === "done" ? (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"><ShieldCheck className="mr-2 inline size-4" />Phone verified. Use it in the sign-in form above.</div>
      ) : step === "credentials" ? (
        <form onSubmit={requestCode} className="flex flex-col gap-3">
          <div className="space-y-1.5"><Label htmlFor="bootstrap-admin-email">Super Admin account email</Label><Input id="bootstrap-admin-email" type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="bootstrap-admin-password">Account password</Label><Input id="bootstrap-admin-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="bootstrap-admin-phone">Phone to verify</Label><Input id="bootstrap-admin-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="015XXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
          <Button type="submit" variant="outline" disabled={busy || !/^\+[1-9]\d{7,14}$/.test(canonicalPhone)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Send verification code</Button>
        </form>
      ) : (
        <form onSubmit={verifyCode} className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">Enter the 6-digit code sent to {phone.replace(/^(.{3}).*(.{3})$/, "$1••••••$2")}.</p>
          <div className="space-y-1.5"><Label htmlFor="bootstrap-admin-otp">SMS verification code</Label><Input id="bootstrap-admin-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
          <p aria-live="polite" className="text-xs text-muted-foreground">{attemptsRemaining} attempts remaining. Code expires in 5 minutes.</p>
          <Button type="submit" variant="outline" disabled={busy || otp.length !== 6 || attemptsRemaining === 0}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Verify phone</Button>
          <Button type="button" variant="ghost" disabled={busy} onClick={() => { setStep("credentials"); setOtp(""); setError(""); }}>Back</Button>
        </form>
      )}
    </section>
  );
}
