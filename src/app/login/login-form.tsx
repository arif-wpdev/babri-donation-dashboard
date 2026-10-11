"use client";

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { 
  Eye, 
  EyeOff, 
  Fingerprint, 
  Loader2, 
  Lock, 
  Phone, 
  ShieldCheck, 
  ArrowRight,
  ArrowLeft,
  KeyRound,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { OverlayLoader } from "@/components/ui/overlay-loader";

export function LoginForm({ callbackUrl, mfaEnabled, invitedPhone = "" }: { callbackUrl: string; mfaEnabled: boolean; invitedPhone?: string }) {
  const router = useRouter();
  const isNavigatingRef = useRef(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("Processing...");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [step, setStep] = useState<"password" | "otp" | "register-passkey">("password");
  const [biometricFailed, setBiometricFailed] = useState(false);
  const [biometricErrorText, setBiometricErrorText] = useState<string | null>(null);
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
    if (factor === "biometric") {
      setBiometricFailed(false);
      setBiometricErrorText(null);
    }
    setStatusMessage(
      factor === "biometric"
        ? "Starting biometric..."
        : factor === "otp"
        ? "Sending OTP..."
        : "Verifying..."
    );
    const phoneIdentifier = String(formData.get("identifier") || "");
    const passwordValue = String(formData.get("password") || "");
    try {
      const response = await fetch("/api/auth/mfa/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: phoneIdentifier, password: passwordValue || undefined, ...(factor ? { factor } : {}) }),
      });
      const result = await response.json();
      if (!response.ok && result.next === "legacy-password") throw new Error(result.error || "Invalid sign-in details");
      if (response.ok && result.next === "legacy-password") {
        await completeLegacyAdminLogin(phoneIdentifier, passwordValue);
        return;
      }
      if (response.status === 409 && factor === "biometric") {
        setBiometricFailed(true);
        setBiometricErrorText(result.error || "Biometric sign-in is not registered on this device.");
        setIsPending(false);
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
        // Instant biometric prompt inline without navigating to another screen
        await authenticatePasskey(result.options);
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
      if (factor === "biometric") {
        setBiometricFailed(true);
        setBiometricErrorText(error instanceof Error ? error.message : "Biometric sign-in failed.");
      } else {
        setErrorMsg(error instanceof Error ? error.message : "Sign-in failed");
      }
    } finally {
      if (!isNavigatingRef.current) {
        setIsPending(false);
      }
    }
  };

  const handleLegacyLogin = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    setStatusMessage("Signing in...");
    const formData = new FormData(event.currentTarget);
    try {
      const { signIn } = await import("next-auth/react");
      const result = await signIn("credentials", { identifier: formData.get("identifier"), password: formData.get("password"), redirect: false });
      if (result?.error) throw new Error("Invalid sign-in details");
      isNavigatingRef.current = true;
      setIsNavigating(true);
      setStatusMessage("Redirecting...");
      window.location.assign(callbackUrl || "/dashboard");
    } catch (error) {
      isNavigatingRef.current = false;
      setErrorMsg(error instanceof Error ? error.message : "Sign-in failed");
      setIsPending(false);
    }
  };

  const completeLegacyAdminLogin = async (phoneIdentifier: string, passwordValue: string) => {
    isNavigatingRef.current = true;
    setIsNavigating(true);
    setStatusMessage("Signing in...");
    const { signIn } = await import("next-auth/react");
    const result = await signIn("credentials", { identifier: phoneIdentifier, password: passwordValue, redirect: false });
    if (result?.error) {
      isNavigatingRef.current = false;
      setIsNavigating(false);
      throw new Error("Could not finish the existing Org Admin sign-in.");
    }
    setStatusMessage("Redirecting...");
    window.location.assign(callbackUrl || "/dashboard");
  };

  const startFactorLogin = async (factor: "biometric" | "otp") => {
    const form = document.getElementById("login-form") as HTMLFormElement | null;
    if (!form) return;
    if (passwordRequired && !String(new FormData(form).get("password") || "")) {
      setErrorMsg("Please enter password.");
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
    setErrorMsg("Choose Biometric or OTP.");
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
    isNavigatingRef.current = true;
    setIsNavigating(true);
    setStatusMessage("Signing in...");
    try {
      const response = await fetch("/api/auth/mfa/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginTicket, callbackUrl }),
      });
      const result = await response.json();
      if (!response.ok) {
        isNavigatingRef.current = false;
        setIsNavigating(false);
        throw new Error(result.error || "Could not finish sign-in");
      }
      setOtp("");
      setErrorMsg(null);
      if (offerPasskeyRegistration) {
        isNavigatingRef.current = false;
        setIsNavigating(false);
        setStep("register-passkey");
        return;
      }
      setStatusMessage("Redirecting...");
      const target = result.redirectTo || callbackUrl || "/dashboard";
      window.location.assign(target);
    } catch (err) {
      isNavigatingRef.current = false;
      setIsNavigating(false);
      throw err;
    }
  };

  const authenticatePasskey = async (options?: PublicKeyCredentialRequestOptionsJSON) => {
    setIsPending(true);
    setStatusMessage("Scanning...");
    try {
      let requestOptions = options ?? passkeyOptions;
      if (!requestOptions) {
        const optionsResponse = await fetch("/api/auth/mfa/passkey/login-options", { method: "POST" });
        requestOptions = await optionsResponse.json();
        if (!optionsResponse.ok) throw new Error("Passkey sign-in could not be started");
      }
      if (!requestOptions) throw new Error("Passkey request options are missing");
      const response = await startAuthentication(requestOptions);
      setStatusMessage("Verifying...");
      const verify = await fetch("/api/auth/mfa/passkey/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response }),
      });
      const result = await verify.json();
      if (!verify.ok) throw new Error(result.error || "Passkey verification failed");
      setPasskeyOptions(undefined);
      setBiometricFailed(false);
      setBiometricErrorText(null);
      await finishLogin(result.loginTicket);
    } catch (error) {
      setPasskeyOptions(undefined);
      if (!isNavigatingRef.current) {
        setIsPending(false);
      }
      setBiometricFailed(true);
      const isCancellation = 
        error instanceof Error && 
        (error.name === "NotAllowedError" || error.name === "AbortError" || error.message.toLowerCase().includes("cancel"));
      const isExpired = 
        error instanceof Error && 
        (error.message.toLowerCase().includes("expired") || error.name === "TimeoutError");
      
      if (isCancellation) {
        setBiometricErrorText("Biometric verification was cancelled.");
      } else if (isExpired) {
        setBiometricErrorText("Passkey request expired.");
      } else {
        setBiometricErrorText(error instanceof Error ? error.message : "Biometric verification failed.");
      }
    }
  };

  const verifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsPending(true);
    setErrorMsg(null);
    setStatusMessage("Verifying OTP...");
    try {
      const response = await fetch("/api/auth/mfa/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (response.status === 429) setOtpLocked(true);
        if (typeof result.attemptsRemaining === "number") setAttemptsRemaining(result.attemptsRemaining);
        throw new Error(result.error || "Code verification failed");
      }
      await finishLogin(result.loginTicket, result.offerPasskeyRegistration === true);
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Code verification failed");
      setIsPending(false);
    }
  };

  const registerPasskey = async () => {
    setIsPending(true);
    setErrorMsg(null);
    setStatusMessage("Registering...");
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
      setIsNavigating(true);
      setStatusMessage("Redirecting...");
      window.location.assign(callbackUrl || "/dashboard");
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : "Passkey registration failed");
      setIsPending(false);
    }
  };

  return (
    <div className="w-full">
      {/* Persistent Overlay Loader that stays visible during redirect to eliminate freeze */}
      <OverlayLoader 
        visible={isPending || isNavigating} 
        message={isNavigating ? statusMessage : statusMessage} 
      />

      {errorMsg && (
        <div className="mb-4 bg-red-50 text-red-700 px-4 py-3 rounded-2xl text-xs sm:text-sm border border-red-100 flex items-start gap-2.5 shadow-sm animate-in fade-in duration-200">
          <AlertCircle className="size-4 shrink-0 text-red-500 mt-0.5" />
          <div className="flex-1 leading-snug">{errorMsg}</div>
        </div>
      )}

      {adminSetupRequired && (
        <div className="mb-4 p-3 bg-amber-50 rounded-2xl border border-amber-200/60 text-center">
          <Link href="/setup/admin" className="text-xs sm:text-sm font-semibold text-emerald-800 hover:underline">
            Open administrator phone setup →
          </Link>
        </div>
      )}

      {/* STEP 1: Phone & Password Form */}
      {step === "password" && (
        <form id="login-form" onSubmit={submitPasswordStep} className="flex flex-col gap-4 w-full">
          {/* Phone input */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="identifier" className="text-xs font-semibold text-slate-700">
              Phone number
            </Label>
            <div className="relative">
              <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <Input
                id="identifier"
                name="identifier"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                required
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setBiometricFailed(false);
                  setBiometricErrorText(null);
                }}
                className="h-12 pl-10 rounded-2xl bg-slate-50/70 border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all font-medium text-base sm:text-sm shadow-none"
              />
            </div>
          </div>

          {/* Password input */}
          {passwordRequired && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-xs font-semibold text-slate-700">
                  Password
                </Label>
                <Link 
                  href="/recover/password" 
                  className="text-xs font-medium text-emerald-700 hover:text-emerald-800 hover:underline transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required={passwordRequired}
                  placeholder="••••••••••••"
                  className="h-12 pl-10 pr-11 rounded-2xl bg-slate-50/70 border-slate-200 text-slate-900 focus:bg-white focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10 transition-all text-base sm:text-sm shadow-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors p-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
          )}

          {/* Primary & Factor Actions */}
          {mfaEnabled && factorButtonsVisible ? (
            <div className="flex flex-col gap-3 pt-2">
              {/* Prominent Biometric Button */}
              <button
                type="button"
                disabled={isPending || isNavigating}
                onClick={() => void startFactorLogin("biometric")}
                className="group relative w-full h-[52px] rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.99] text-white shadow-md shadow-emerald-700/20 transition-all flex items-center justify-center gap-3 px-4 font-semibold text-sm cursor-pointer disabled:opacity-60"
              >
                <div className="size-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 transition-transform group-hover:scale-110">
                  <Fingerprint className="size-5 text-white" />
                </div>
                <div className="flex flex-col text-left leading-tight">
                  <span className="font-semibold text-white tracking-wide">Login with Biometric</span>
                  <span className="text-[11px] text-emerald-100/90 font-normal">Touch ID, Face ID or Passkey</span>
                </div>
                <ArrowRight className="size-4 text-emerald-200 ml-auto transition-transform group-hover:translate-x-0.5" />
              </button>

              {/* Prompt to use OTP if Biometric failed or cancelled */}
              {biometricFailed && (
                <div className="rounded-2xl bg-amber-50/90 border border-amber-200/80 p-3.5 flex items-start gap-2.5 text-amber-900 shadow-sm animate-in fade-in duration-200">
                  <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="flex-1 text-xs leading-snug">
                    <p className="font-semibold text-amber-950">
                      {biometricErrorText || "Biometric verification was not completed."}
                    </p>
                    <p className="text-amber-800/90 mt-0.5 font-medium">
                      Please sign in with OTP (SMS) below:
                    </p>
                  </div>
                </div>
              )}

              {/* Minimal Divider (only shown when not in failed state) */}
              {!biometricFailed && (
                <div className="relative my-0.5 flex items-center justify-center">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-100" />
                  </div>
                  <span className="relative bg-white px-3 text-[11px] font-medium text-slate-400 uppercase tracking-wider">
                    or continue with
                  </span>
                </div>
              )}

              {/* Secondary OTP Button - Highlighted if Biometric failed */}
              <Button
                type="button"
                variant={biometricFailed ? "default" : "outline"}
                disabled={isPending || isNavigating}
                onClick={() => void startFactorLogin("otp")}
                className={cn(
                  "w-full h-11 rounded-2xl font-medium text-sm flex items-center justify-center gap-2 transition-all active:scale-[0.99]",
                  biometricFailed
                    ? "bg-emerald-700 hover:bg-emerald-800 text-white shadow-md shadow-emerald-800/20 border-transparent font-semibold"
                    : "border-slate-200/90 bg-slate-50/60 hover:bg-slate-100/80 text-slate-700 shadow-none"
                )}
              >
                <ShieldCheck className={cn("size-4 shrink-0", biometricFailed ? "text-white" : "text-emerald-700")} />
                <span>Login with OTP (SMS)</span>
                {biometricFailed && <ArrowRight className="size-4 ml-0.5" />}
              </Button>
            </div>
          ) : (
            <div className="pt-2">
              <Button 
                type="submit" 
                disabled={isPending || isNavigating} 
                className="h-12 w-full rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-md shadow-emerald-800/15 transition-all active:scale-[0.99]"
              >
                {isPending || isNavigating ? (
                  <Loader2 className="mx-auto size-4 animate-spin" />
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    Continue <ArrowRight className="size-4" />
                  </span>
                )}
              </Button>
            </div>
          )}

          {/* Recovery link at the bottom */}
          <div className="pt-2 text-center">
            <Link 
              href="/recover/account" 
              className="text-xs text-slate-400 hover:text-slate-600 hover:underline transition-colors"
            >
              Sign in with a recovery code
            </Link>
          </div>
        </form>
      )}

      {/* STEP 2: OTP Verification Screen */}
      {step === "otp" && (
        <div className="flex w-full flex-col gap-5 animate-in fade-in duration-200">
          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100/70 p-3.5 text-xs sm:text-sm text-emerald-950 flex items-start gap-3">
            <div className="size-7 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5">
              <ShieldCheck className="size-4 text-emerald-700" />
            </div>
            <div className="leading-relaxed">
              {otpLocked 
                ? "Verification is temporarily locked. Please use a recovery code or try again later."
                : "Enter the 6-digit code sent to your registered phone."
              }
            </div>
          </div>

          <form onSubmit={verifyOtp} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="otp" className="text-xs font-semibold text-slate-700 text-center">
                6-digit verification code
              </Label>
              <Input
                id="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={otp}
                onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
                className="h-14 text-center text-2xl font-mono tracking-[0.45em] font-bold rounded-2xl bg-slate-50 border-slate-200 focus:bg-white focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10"
              />
            </div>

            <p aria-live="polite" className="text-xs text-center text-slate-500">
              {otpLocked 
                ? "Temporarily locked" 
                : `${attemptsRemaining} attempts left · ${resendIn > 0 ? `Resend code in ${resendIn}s` : "Code ready to resend"}`
              }
            </p>

            <Button
              type="submit"
              disabled={isPending || isNavigating || otpLocked || otp.length !== 6}
              className="h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-md shadow-emerald-800/15 transition-all active:scale-[0.99] disabled:opacity-50"
            >
              {isPending || isNavigating ? (
                <Loader2 className="mx-auto size-4 animate-spin" />
              ) : (
                "Verify Code & Sign In"
              )}
            </Button>

            <button
              type="button"
              disabled={isPending || isNavigating || otpLocked || resendIn > 0}
              onClick={() => void requestOtp().then(() => setErrorMsg(null)).catch((error) => setErrorMsg(error.message))}
              className="text-xs text-emerald-700 font-medium hover:underline disabled:text-slate-400 disabled:no-underline transition-colors"
            >
              Resend verification code
            </button>
          </form>

          <div className="flex flex-col gap-2 pt-2 text-center">
            <Link href="/recover/account" className="text-xs text-slate-500 hover:text-emerald-700 hover:underline">
              Sign in with a recovery code
            </Link>
            <button
              type="button"
              onClick={() => {
                setStep("password");
                setBiometricFailed(false);
                setBiometricErrorText(null);
              }}
              className="text-xs text-slate-400 hover:text-slate-600"
            >
              Back to login options
            </button>
          </div>
        </div>
      )}

      {/* STEP 4: Register Passkey Screen */}
      {step === "register-passkey" && (
        <div className="flex w-full flex-col gap-4 text-center animate-in fade-in duration-200">
          <div className="rounded-2xl bg-emerald-50/70 border border-emerald-100/70 p-5 flex flex-col items-center">
            <div className="size-14 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-700 mb-3">
              <CheckCircle2 className="size-8" />
            </div>
            <h2 className="text-base font-bold text-slate-900">Sign-in Verified</h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Enable biometric sign-in on this device for one-tap instant access in the future.
            </p>
          </div>

          <Button
            type="button"
            disabled={isPending || isNavigating}
            onClick={() => void registerPasskey()}
            className="h-12 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-sm shadow-md shadow-emerald-800/15 flex items-center justify-center gap-2"
          >
            <Fingerprint className="size-4" />
            <span>{isPending || isNavigating ? "Setting up..." : "Enable Biometric on this Device"}</span>
          </Button>

          <button
            type="button"
            disabled={isPending || isNavigating}
            onClick={() => {
              setIsNavigating(true);
              setStatusMessage("Redirecting...");
              window.location.assign(callbackUrl || "/dashboard");
            }}
            className="text-xs text-slate-400 hover:text-slate-600 pt-1"
          >
            Skip for now & go to dashboard →
          </button>
        </div>
      )}
    </div>
  );
}

