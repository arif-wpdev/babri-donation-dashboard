"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Fingerprint, Loader2, ShieldCheck } from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OverlayLoader } from "@/components/ui/overlay-loader";

export function LoginForm({ callbackUrl, mfaEnabled, invitedPhone = "" }: { callbackUrl: string; mfaEnabled: boolean; invitedPhone?: string }) {
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
  const [employeeLogin, setEmployeeLogin] = useState(false);
  const [superAdminLogin, setSuperAdminLogin] = useState(false);
  const [registeredPhoneHint, setRegisteredPhoneHint] = useState("");
  const [identifier, setIdentifier] = useState(invitedPhone);
  const [passwordRequired, setPasswordRequired] = useState(!mfaEnabled);
  const [factorButtonsVisible, setFactorButtonsVisible] = useState(!mfaEnabled);
  const [adminSetupRequired, setAdminSetupRequired] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setResendIn((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const handlePassword = async (e: React.FormEvent<HTMLFormElement>, factor: "biometric" | "otp" | null = null) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsPending(true);
    setErrorMsg(null);
    const phoneIdentifier = String(formData.get("identifier") || "");
    const passwordValue = String(formData.get("password") || "");
    try {
      const response = await fetch("/api/auth/mfa/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: phoneIdentifier, password: passwordValue || undefined, ...(factor ? { factor } : {}) }) });
      const result = await response.json();
      if (!response.ok && result.next === "legacy-password") throw new Error(result.error || "Invalid sign-in details");
      if (response.ok && result.next === "legacy-password") {
        await completeLegacyAdminLogin(phoneIdentifier, passwordValue);
        return;
      }
      if (response.status === 409 && factor === "biometric") {
        setErrorMsg(result.error || "Biometric sign-in is unavailable on this device. Choose OTP.");
        return;
      }
      if (response.status === 409 && typeof result.error === "string" && result.error.includes("/setup/admin")) {
        setAdminSetupRequired(true);
        setErrorMsg(result.error);
        return;
      }
      if (response.status === 409 && factor === null && passwordValue.length === 0) {
        setPasswordRequired(true);
        setErrorMsg(null);
        return;
      }
      if (!response.ok && response.status === 401 && passwordValue.length === 0 && mfaEnabled) {
        setPasswordRequired(true);
        setErrorMsg(null);
        return;
      }
      if (!response.ok) throw new Error(result.error || "Sign-in failed");
      setFactorButtonsVisible(true);
      if (result.next === "choose-factor") return;
      setEmployeeLogin(result.employee === true);
      setSuperAdminLogin(result.role === "SUPER_ADMIN");
      setRegisteredPhoneHint(typeof result.identifier === "string" ? result.identifier : "");
      if (result.next === "passkey") {
        setPasskeyOptions(result.options);
        setStep("passkey");
        void authenticatePasskey(result.options);
      } else {
        setPasskeyOptions(undefined);
        setStep("otp");
        setOtpLocked(false);
        setResendIn(60);
        try {
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

  const completeLegacyAdminLogin = async (phoneIdentifier: string, passwordValue: string) => {
    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", { identifier: phoneIdentifier, password: passwordValue, redirect: false });
    if (result?.error) throw new Error("Could not finish the existing Org Admin sign-in.");
    router.replace(callbackUrl);
    router.refresh();
  };

  const startFactorLogin = async (factor: "biometric" | "otp") => {
    const form = document.getElementById("login-form") as HTMLFormElement | null;
    if (!form) return;
    if (passwordRequired && !String(new FormData(form).get("password") || "")) {
      setErrorMsg("Enter your password to continue.");
      document.getElementById("password")?.focus();
      return;
    }
    await handlePassword({ preventDefault: () => undefined, currentTarget: form } as React.FormEvent<HTMLFormElement>, factor);
  };

  const submitPasswordStep = (event: React.FormEvent<HTMLFormElement>) => {
    if (!mfaEnabled) {
      void handleLegacyLogin(event);
      return;
    }
    if (!factorButtonsVisible) {
      void handlePassword(event);
      return;
    }
    if (!passwordRequired) {
      void handlePassword(event);
      return;
    }
    event.preventDefault();
    setErrorMsg("Choose Login with Biometric or Login with OTP to continue.");
  };

  const requestOtp = async () => {
    const response = await fetch("/api/auth/mfa/otp/request", { method: "POST" });
    const result = await response.json();
    if (!response.ok) {
      const retryAfter = Number(result.retryAfterSeconds || response.headers.get("Retry-After"));
      if (Number.isFinite(retryAfter) && retryAfter > 0) setResendIn(retryAfter);
      throw new Error(result.error || "Could not send verification code");
    }
    setResendIn(result.resendInSeconds || 60);
    setAttemptsRemaining(3);
    setOtpLocked(false);
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
      setPasskeyOptions(undefined);
    } finally {
      setIsPending(false);
    }
  };

  const fallbackToOtp = async () => {
    setIsPending(true);
    setErrorMsg(null);
    try {
      const response = await fetch("/api/auth/mfa/passkey/fallback", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "OTP fallback could not be started");
      setPasskeyOptions(undefined);
      setStep("otp");
      await requestOtp();
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "OTP fallback could not be started");
    } finally {
      setIsPending(false);
    }
  };

  const restartPasskeyLogin = () => {
    setStep("password");
    setPasskeyOptions(undefined);
    setEmployeeLogin(false);
    setSuperAdminLogin(false);
    setFactorButtonsVisible(false);
    setPasswordRequired(false);
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

  return (
    <div className="w-full">
      <OverlayLoader visible={isPending} message={step === "passkey" ? "Verifying Passkey..." : step === "otp" ? "Verifying Code..." : "Processing..."} />
      {errorMsg && (
        <div className="bg-red-50 text-red-600 p-3 rounded-xl text-sm border border-red-100 flex items-center justify-center">
          {errorMsg}
        </div>
      )}
      {adminSetupRequired && <Link href="/setup/admin" className="mt-2 block text-center text-sm font-medium text-primary underline">Open administrator phone setup</Link>}
      {step === "password" && mfaEnabled && <div className="mt-2 flex justify-center gap-4 text-sm text-muted-foreground"><Link href="/recover/password" className="underline">Forgot password?</Link><Link href="/recover/account" className="underline">Use recovery code</Link></div>}

      {step === "password" && <form id="login-form" onSubmit={submitPasswordStep} className="flex flex-col gap-4 w-full">
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
            value={identifier}
            onChange={(event) => setIdentifier(event.target.value)}
            className="h-11 rounded-xl bg-background/50"
          />
        </div>
        {passwordRequired && <div className="flex flex-col gap-2">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required={passwordRequired}
              className="h-11 rounded-xl bg-background/50 pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>}
        {mfaEnabled && factorButtonsVisible ? <div className="grid grid-cols-2 gap-3 pt-1">
          <Button type="button" variant="outline" disabled={isPending} onClick={() => void startFactorLogin("biometric")} className="h-10 gap-2 px-2 text-sm"><Fingerprint className="size-4 shrink-0" />Login with Biometric</Button>
          <Button type="button" disabled={isPending} onClick={() => void startFactorLogin("otp")} className="h-10 gap-2 px-2 text-sm"><ShieldCheck className="size-4 shrink-0" />Login with OTP</Button>
        </div> : <button type="submit" disabled={isPending} className="h-11 w-full rounded-xl bg-primary font-medium text-primary-foreground">{isPending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Continue"}</button>}
      </form>}

      {step === "otp" && <div className="flex w-full flex-col gap-5">
        <div className="rounded-xl bg-muted/50 p-3 text-sm"><ShieldCheck className="mr-2 inline size-4" />{otpLocked ? "Verification is locked. You can use a single-use recovery code or return later." : "Enter the code sent only to your registered phone."}</div>
        <form onSubmit={verifyOtp} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2"><Label htmlFor="otp">6-digit verification code</Label><Input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} className="h-12 text-center text-xl tracking-[0.4em]" /></div>
          <p aria-live="polite" className="text-sm text-muted-foreground">{otpLocked ? "Verification is temporarily unavailable. Use a recovery code or try again after the lock period." : `${attemptsRemaining} attempts remaining · ${resendIn > 0 ? `Resend available in ${resendIn}s` : "You can request a new code"}`}</p>
          <button type="submit" disabled={isPending || otpLocked || otp.length !== 6} className="h-11 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60">{isPending ? <Loader2 className="mx-auto size-4 animate-spin" /> : "Verify OTP and sign in"}</button>
          <button type="button" disabled={isPending || otpLocked || resendIn > 0} onClick={() => void requestOtp().then(() => setErrorMsg(null)).catch((error) => setErrorMsg(error.message))} className="text-sm text-primary disabled:text-muted-foreground">Resend code</button>
        </form>
        <Link href="/recover/account" className="text-center text-sm text-primary underline">Sign in with a recovery code</Link>
        {superAdminLogin && <p className="text-center text-xs text-muted-foreground">Code sent to your registered phone {registeredPhoneHint}.</p>}
      </div>}

      {step === "passkey" && <div className="flex w-full flex-col gap-4 text-center">
        <div className="rounded-xl bg-muted/50 p-4 text-sm"><Fingerprint className="mx-auto mb-2 size-8 text-primary" />Use your device passkey, fingerprint or Face ID to sign in.</div>
        <button type="button" disabled={isPending} onClick={() => void authenticatePasskey()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"><Fingerprint className="size-4" />{isPending ? "Verifying…" : "Continue with passkey"}</button>
        {(employeeLogin || superAdminLogin) && <button type="button" disabled={isPending} onClick={() => void fallbackToOtp()} className="text-sm text-primary">Passkey কাজ করছে না? নিবন্ধিত ফোনে OTP নিন</button>}
        <button type="button" disabled={isPending} onClick={restartPasskeyLogin} className="text-sm text-muted-foreground">Restart sign-in</button>
      </div>}
      {step === "register-passkey" && <div className="flex w-full flex-col gap-4 text-center">
        <div className="rounded-xl bg-muted/50 p-4 text-sm"><Fingerprint className="mx-auto mb-2 size-8 text-primary" />Password ও OTP verification সম্পন্ন। এই device-এ passkey যোগ করুন—biometric তথ্য device-এর বাইরে যাবে না।</div>
        <button type="button" disabled={isPending} onClick={() => void registerPasskey()} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-primary font-medium text-primary-foreground disabled:opacity-60"><Fingerprint className="size-4" />{isPending ? "Registering…" : "Register passkey and continue"}</button>
        <button type="button" disabled={isPending} onClick={() => { router.replace(callbackUrl); router.refresh(); }} className="text-sm text-muted-foreground">Continue without trusting this device</button>
      </div>}
    </div>
  );
}
