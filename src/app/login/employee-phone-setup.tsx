"use client";

import { useEffect, useState } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON } from "@simplewebauthn/types";
import { Fingerprint, Loader2, Phone, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function normalizeBangladeshPhone(input: string) {
  const value = input.replace(/[\s().-]/g, "");
  if (/^01[3-9]\d{8}$/.test(value)) return `+880${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  return value;
}

export function EmployeePhoneSetup() {
  const router = useRouter();
  const [step, setStep] = useState<"phone" | "otp" | "passkey">("phone");
  const [targetRole, setTargetRole] = useState<"ORG_USER" | "ORG_ADMIN">("ORG_USER");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [resendIn, setResendIn] = useState(0);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [options, setOptions] = useState<PublicKeyCredentialCreationOptionsJSON | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const canonicalPhone = normalizeBangladeshPhone(phone);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setResendIn((seconds) => Math.max(0, seconds - 1));
      setOtpExpiresIn((seconds) => Math.max(0, seconds - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const requestCode = async () => {
    const response = await fetch("/api/auth/mfa/employee-phone/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: canonicalPhone }) });
    const result = await response.json();
    if (!response.ok) {
      if (typeof result.retryAfterSeconds === "number") setResendIn(result.retryAfterSeconds);
      throw new Error(result.error || "Could not request verification code");
    }
    setResendIn(result.resendInSeconds || 60);
    setOtpExpiresIn(result.expiresInSeconds || 300);
    setAttemptsRemaining(3);
    setOptions(null);
    setOtp("");
    setStep("otp");
    toast.success("Verification code sent to your registered phone.");
  };

  const refreshPasskeyOptions = async (): Promise<PublicKeyCredentialCreationOptionsJSON> => {
    const response = await fetch("/api/auth/mfa/employee-phone/passkey-options", { method: "POST" });
    const publicKeyOptions = await response.json();
    if (!response.ok) throw new Error(publicKeyOptions.error || "Passkey setup could not be started");
    setOptions(publicKeyOptions);
    setError("");
    return publicKeyOptions;
  };

  const sendCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await requestCode();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not request verification code");
    } finally {
      setBusy(false);
    }
  };

  const verifyCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/employee-phone/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ phone: canonicalPhone, otp }) });
      const result = await response.json();
      if (!response.ok) {
        if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
        throw new Error(result.error || "Phone verification failed");
      }
      if (typeof result.targetRole === "string" && (result.targetRole === "ORG_USER" || result.targetRole === "ORG_ADMIN")) setTargetRole(result.targetRole);
      setOtp("");
      setStep("passkey");
      await refreshPasskeyOptions();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Phone verification failed");
    } finally {
      setBusy(false);
    }
  };

  const enrollPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const currentOptions = options ?? await refreshPasskeyOptions();
      const registration = await startRegistration(currentOptions);
      const response = await fetch("/api/auth/mfa/employee-phone/passkey-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: registration }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Passkey registration failed");
      const sessionResponse = await fetch("/api/auth/mfa/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ onboardingTicket: result.onboardingTicket, callbackUrl: "/dashboard" }) });
      const sessionResult = await sessionResponse.json();
      if (!sessionResponse.ok) throw new Error(sessionResult.error || "Could not finish sign-in");
      toast.success("Passkey registered. Welcome!");
      router.replace(sessionResult.redirectTo || "/dashboard");
      router.refresh();
    } catch (cause) {
      setOptions(null);
      setError(cause instanceof Error ? cause.message : "Passkey setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="mt-6 w-full border-t pt-5" aria-labelledby="employee-phone-setup-title">
      <div className="mb-3 flex items-center gap-2"><Phone className="size-4 text-primary" /><h2 id="employee-phone-setup-title" className="text-sm font-semibold">{targetRole === "ORG_ADMIN" ? "Org Admin first-time setup" : "Employee first-time setup"}</h2></div>
      <p className="mb-4 text-xs text-muted-foreground">Use the number registered by your Super Admin. Verify it by SMS once, then add a passkey for easy sign-in. No password needed.</p>
      {error && <p role="alert" className="mb-3 rounded-lg border border-destructive/20 bg-destructive/5 p-2 text-sm text-destructive">{error}</p>}
      {step === "phone" && <form onSubmit={sendCode} className="flex flex-col gap-3">
        <div className="space-y-1.5"><Label htmlFor="employee-bootstrap-phone">Registered mobile number</Label><Input id="employee-bootstrap-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="015XXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
        <Button type="submit" variant="outline" disabled={busy || !/^\+8801[3-9]\d{8}$/.test(canonicalPhone)}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Send SMS code</Button>
      </form>}
      {step === "otp" && <form onSubmit={verifyCode} className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Enter the code sent to {canonicalPhone.replace(/^(.{3}).*(.{3})$/, "$1••••••$2")}.</p>
        <div className="space-y-1.5"><Label htmlFor="employee-bootstrap-code">6-digit verification code</Label><Input id="employee-bootstrap-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        <p aria-live="polite" className="text-xs text-muted-foreground">{attemptsRemaining} attempts remaining · {otpExpiresIn > 0 ? `Code expires in ${otpExpiresIn}s` : "Code expired; request a new one."} · {resendIn > 0 ? `Resend available in ${resendIn}s` : "Resend available"}</p>
        <Button type="submit" variant="outline" disabled={busy || otp.length !== 6 || attemptsRemaining === 0}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Verify and continue</Button>
        <Button type="button" variant="ghost" disabled={busy || resendIn > 0} onClick={() => { setBusy(true); setError(""); void requestCode().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not request verification code")).finally(() => setBusy(false)); }}>{resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}</Button>
      </form>}
      {step === "passkey" && <div className="flex flex-col gap-3">
        <p className="rounded-lg bg-muted/50 p-3 text-sm"><ShieldCheck className="mr-2 inline size-4" />Phone verification succeeded. Add a passkey to finish setup. Your fingerprint/Face ID stays on this device.</p>
        <Button type="button" disabled={busy} onClick={() => void enrollPasskey()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Fingerprint className="mr-2 size-4" />}{options ? "Set up passkey and sign in" : "Retry passkey setup"}</Button>
        <Button type="button" variant="ghost" disabled={busy || resendIn > 0} onClick={() => { setBusy(true); setError(""); void requestCode().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not request verification code")).finally(() => setBusy(false)); }}>{resendIn > 0 ? `Request a fresh code in ${resendIn}s` : "Passkey setup expired? Request a fresh code"}</Button>
      </div>}
    </section>
  );
}
