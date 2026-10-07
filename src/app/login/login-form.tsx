"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Eye, EyeOff, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { useRouter } from "next/navigation";
import { SuperAdminPhoneSetup } from "./super-admin-phone-setup";
import { EmployeePhoneSetup } from "./employee-phone-setup";

export function LoginForm({ callbackUrl, mfaEnabled }: { callbackUrl: string; mfaEnabled: boolean }) {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<"password" | "otp" | "passkey" | "register-passkey">("password");
  const [otp, setOtp] = useState("");
  const [attemptsRemaining, setAttemptsRemaining] = useState(3);
  const [resendIn, setResendIn] = useState(0);
  const [otpLocked, setOtpLocked] = useState(false);
  const [passkeyOptions, setPasskeyOptions] = useState<PublicKeyCredentialRequestOptionsJSON | undefined>();
  const [registrationOptions, setRegistrationOptions] = useState<PublicKeyCredentialCreationOptionsJSON | undefined>();

  useEffect(() => {
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/auth/mfa/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: formData.get("identifier"), password: formData.get("password") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed");
      if (result.next === "passkey") {
        setPasskeyOptions(result.options);
        setStep("passkey");
      } else {
        setPasskeyOptions(undefined);
        setStep("otp");
        setOtpLocked(false);
        try {
          setResendIn(0);
          await requestOtp();
        } catch (error) {
          setErrorMsg(error instanceof Error ? error.message : "Could not send verification code");
        }
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setIsPending(false);
    }
  };

  const handleLegacyLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    const formData = new FormData(event.currentTarget);
    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", { identifier: formData.get("identifier"), password: formData.get("password"), redirect: false });
      if (result?.error) throw new Error("Invalid sign-in details");
      router.replace(callbackUrl);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Sign-in failed");
    } finally {
      setIsPending(false);
    }
  };

  const requestOtp = async () => {
    const response = await fetch("/api/auth/mfa/otp/request", { method: "POST" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not send verification code");
    setResendIn(result.resendInSeconds || 60);
    setAttemptsRemaining(3);
  };

  const finishLogin = async (loginTicket: string, offerPasskeyRegistration = false) => {
    const response = await fetch("/api/auth/mfa/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ loginTicket, callbackUrl }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Could not finish sign-in");
    setOtp("");
    setErrorMsg(null);
    if (offerPasskeyRegistration) {
      setStep("register-passkey");
      return;
    }
    router.replace(result.redirectTo || "/dashboard");
    router.refresh();
  };

  const authenticatePasskey = async (options?: PublicKeyCredentialRequestOptionsJSON) => {
    setIsPending(true);
    setErrorMsg(null);
    try {
      let requestOptions = options ?? passkeyOptions;
      if (!requestOptions) {
        const optionsResponse = await fetch("/api/auth/mfa/passkey/login-options", { method: "POST" });
        requestOptions = await optionsResponse.json();
        if (!optionsResponse.ok) throw new Error("Passkey sign-in could not be started");
      }
      if (!requestOptions) throw new Error("Passkey request options are missing");
      const response = await startAuthentication(requestOptions);
      const verify = await fetch("/api/auth/mfa/passkey/login-verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response }) });
      const result = await verify.json();
      if (!verify.ok) throw new Error(result.error || "Passkey verification failed");
      setPasskeyOptions(undefined);
      await finishLogin(result.loginTicket);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Passkey verification failed");
      setStep("passkey");
    } finally {
      setIsPending(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/auth/mfa/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) setOtpLocked(true);
        if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
        throw new Error(result.error || "Code verification failed");
      }
      await finishLogin(result.loginTicket, result.offerPasskeyRegistration === true);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Code verification failed");
    } finally {
      setIsPending(false);
    }
  };

  const registerPasskey = async () => {
    setIsPending(true);
    setErrorMsg(null);
    try {
      let options = registrationOptions;
      if (!options) {
        const response = await fetch("/api/auth/mfa/passkey/register-options", { method: "POST" });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Passkey registration could not be started");
        options = result;
      }
      if (!options) throw new Error("Passkey registration options are missing");
      const credential = await startRegistration(options);
      const response = await fetch("/api/auth/mfa/passkey/register-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: credential, deviceName: "Trusted mobile device" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Passkey registration failed");
      setRegistrationOptions(undefined);
      router.replace(callbackUrl);
      router.refresh();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Passkey registration failed");
    } finally {
      setIsPending(false);
    }
  };

  const verifyRecoveryCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/mfa/recovery/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: form.get("recoveryCode") }) });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) setOtpLocked(true);
        throw new Error(result.error || "Recovery code could not be verified");
      }
      await finishLogin(result.loginTicket);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Recovery code could not be verified");
    } finally {
      setIsPending(false);
    }
  };

  const [resetRequested, setResetRequested] = useState(false);
  const [resetIdentifier, setResetIdentifier] = useState("");

  const requestPasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    const formData = new FormData(event.currentTarget);
    const resetIdentifier = String(formData.get("resetIdentifier") || "");
    try {
      const response = await fetch("/api/auth/mfa/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: resetIdentifier }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Reset request failed");
      setResetRequested(true);
      setResetIdentifier(resetIdentifier);
      setErrorMsg(result.message || "If the account is eligible, a reset code will be sent.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Reset request failed");
    } finally {
      setIsPending(false);
    }
  };

  const completePasswordReset = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    const formData = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/auth/mfa/password-reset/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: formData.get("resetIdentifier"), otp: formData.get("resetOtp"), newPassword: formData.get("newPassword") }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Password reset failed");
      setStep("password");
      setErrorMsg("Password reset. Sign in with your new password.");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Password reset failed");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="w-full">
      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100 flex items-center justify-center">
          {errorMsg}
        </div>
      )}

      {step === "password" && <form onSubmit={mfaEnabled ? handlePassword : handleLegacyLogin} className="flex flex-col gap-5 w-full">
      <div className="flex flex-col gap-2">
          <Label htmlFor="identifier">Phone number</Label>
        <Input
          id="identifier"
          name="identifier"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="01XXXXXXXXX"
          required
          className="h-11 rounded-xl bg-background/50"
        />
      </div>
      
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
        </div>
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="h-11 rounded-xl bg-background/50 pr-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="h-11 w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium shadow-sm transition-colors mt-2 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
      >
        {isPending && <Loader2 className="size-4 animate-spin" />}
        <span>{mfaEnabled ? "Password → OTP → Login" : "Sign in to Dashboard"}</span>
      </button>
      {mfaEnabled && <p className="text-center text-xs text-muted-foreground">On a trusted mobile device, a registered passkey can replace the OTP.</p>}
      </form>}

      {step === "otp" && <form onSubmit={verifyOtp} className="flex w-full flex-col gap-5">
        <div className="rounded-xl bg-muted/50 p-3 text-sm"><ShieldCheck className="mr-2 inline size-4" />Enter the code sent to your verified phone.</div>
        <div className="flex flex-col gap-2"><Label htmlFor="otp">6-digit verification code</Label><Input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-12 text-center text-xl tracking-[0.4em]" /></div>
        <p aria-live="polite" className="text-sm text-muted-foreground">{otpLocked ? "Verification is temporarily unavailable. Use a recovery code or try again after the lock period." : `${attemptsRemaining} attempts remaining · ${resendIn > 0 ? `Resend available in ${resendIn}s` : "You can request a new code"}`}</p>
        <button type="submit" disabled={isPending || otpLocked || otp.length !== 6} className="h-11 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60">{isPending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Verify OTP and sign in"}</button>
        <button type="button" disabled={isPending || otpLocked || resendIn > 0} onClick={() => void requestOtp().then(() => setErrorMsg(null)).catch((error) => setErrorMsg(error.message))} className="text-sm text-primary disabled:text-muted-foreground">Resend code</button>
        <details className="text-left text-sm"><summary className="cursor-pointer text-primary">Use a recovery code</summary><form onSubmit={verifyRecoveryCode} className="mt-3 flex gap-2"><Input name="recoveryCode" autoComplete="one-time-code" required maxLength={64} placeholder="One-time recovery code" /><button type="submit" disabled={isPending} className="rounded-md border px-3">Verify</button></form></details>
        <button type="button" disabled={isPending} onClick={() => setStep("password")} className="text-sm text-muted-foreground">Back to password</button>
      </form>}

      {step === "passkey" && <div className="flex w-full flex-col gap-4 text-center">
        <div className="rounded-xl bg-muted/50 p-4 text-sm"><Fingerprint className="mx-auto mb-2 size-8 text-primary" />Use your device passkey, fingerprint or Face ID to sign in.</div>
        <button type="button" disabled={isPending} onClick={() => void authenticatePasskey()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"><Fingerprint className="size-4" />{isPending ? "Verifying…" : "Continue with passkey"}</button>
        <button type="button" disabled={isPending} onClick={() => { setStep("password"); setPasskeyOptions(undefined); }} className="text-sm text-muted-foreground">Restart sign-in</button>
      </div>}
      {step === "register-passkey" && <div className="flex w-full flex-col gap-4 text-center">
        <div className="rounded-xl bg-muted/50 p-4 text-sm"><Fingerprint className="mx-auto mb-2 size-8 text-primary" />Password ও OTP verification সম্পন্ন। এই device-এ passkey যোগ করুন—biometric তথ্য device-এর বাইরে যাবে না।</div>
        <button type="button" disabled={isPending} onClick={() => void registerPasskey()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"><Fingerprint className="size-4" />{isPending ? "Registering…" : "Register passkey and continue"}</button>
        <button type="button" disabled={isPending} onClick={() => { router.replace(callbackUrl); router.refresh(); }} className="text-sm text-muted-foreground">Continue without trusting this device</button>
      </div>}
      {step === "password" && mfaEnabled && <details className="mt-5 w-full border-t pt-4 text-sm"><summary className="cursor-pointer text-primary">Forgot password?</summary>
        <form onSubmit={requestPasswordReset} className="mt-3 flex flex-col gap-3"><Input name="resetIdentifier" type="tel" inputMode="tel" autoComplete="tel" required placeholder="Verified phone number (+country code)" /><button disabled={isPending} className="h-10 rounded-xl border">Send recovery code</button></form>
        {resetRequested && <form onSubmit={completePasswordReset} className="mt-3 flex flex-col gap-3"><input type="hidden" name="resetIdentifier" value={resetIdentifier} /><Input name="resetOtp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required placeholder="6-digit reset code" /><Input name="newPassword" type="password" autoComplete="new-password" minLength={12} required placeholder="New password (12+ chars, upper/lower/number)" /><button disabled={isPending} className="h-10 rounded-xl border">Reset password</button></form>}
      </details>}
      {step === "password" && <SuperAdminPhoneSetup />}
      {step === "password" && <EmployeePhoneSetup />}
    </div>
  );
}
