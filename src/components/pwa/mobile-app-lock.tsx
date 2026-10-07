"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import type { PublicKeyCredentialRequestOptionsJSON } from "@simplewebauthn/types";
import { Fingerprint, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ACTIVITY_DEBOUNCE_MS = 5_000;

export function MobileAppLock({ initialLocked = false }: { initialLocked?: boolean }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialLocked);
  const [locked, setLocked] = useState(initialLocked);
  const [otp, setOtp] = useState("");
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [otpRequested, setOtpRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activityPending = useRef(false);
  const lastActivityPost = useRef(0);

  const refreshLockState = useCallback(async () => {
    const response = await fetch("/api/auth/mfa/mobile-lock/state", { cache: "no-store" });
    if (!response.ok) return;
    const state = await response.json() as { enabled?: boolean; locked?: boolean; lastActivityAt?: string };
    setEnabled(state.enabled === true);
    setLocked(state.locked === true);
    if (state.lastActivityAt) lastActivityPost.current = new Date(state.lastActivityAt).getTime();
  }, []);

  const postActivity = useCallback(async () => {
    if (!enabled || locked || activityPending.current || document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastActivityPost.current < ACTIVITY_DEBOUNCE_MS) return;
    activityPending.current = true;
    try {
      const response = await fetch("/api/auth/mfa/mobile-lock/activity", { method: "POST", cache: "no-store" });
      if (response.status === 423) {
        setLocked(true);
        setOtpRequested(false);
        setOtp("");
        return;
      }
      if (response.ok) lastActivityPost.current = now;
    } finally {
      activityPending.current = false;
    }
  }, [enabled, locked]);

  useEffect(() => {
    const isMobileClient = /android|iphone|ipod|ipad|mobile/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    if (!isMobileClient) return;
    const initialStateTimer = window.setTimeout(() => void refreshLockState(), 0);
    const onActivity = () => void postActivity();
    const onVisibility = () => {
      if (document.visibilityState !== "visible" && enabled) {
        void fetch("/api/auth/mfa/mobile-lock/lock", { method: "POST", cache: "no-store", keepalive: true }).then(() => {
          setLocked(true);
          setOtpRequested(false);
          setOtp("");
        }).catch(() => setLocked(true));
      } else if (document.visibilityState === "visible") {
        void refreshLockState();
      }
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshLockState();
    }, 15_000);
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("touchstart", onActivity, { passive: true });
    window.addEventListener("scroll", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(initialStateTimer);
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("touchstart", onActivity);
      window.removeEventListener("scroll", onActivity);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, postActivity, refreshLockState]);

  useEffect(() => {
    if (!otpRequested) return;
    const timer = window.setInterval(() => {
      setOtpExpiresIn((current) => Math.max(0, current - 1));
      setResendIn((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpRequested]);

  const unlockWithPasskey = async () => {
    setBusy(true);
    setError("");
    try {
      const optionsResponse = await fetch("/api/auth/mfa/mobile-lock/passkey/options", { method: "POST", cache: "no-store" });
      const options = await optionsResponse.json() as PublicKeyCredentialRequestOptionsJSON | { error?: string };
      if (!optionsResponse.ok) throw new Error("error" in options ? options.error : "Passkey unlock is unavailable.");
      const assertion = await startAuthentication(options as PublicKeyCredentialRequestOptionsJSON);
      const response = await fetch("/api/auth/mfa/mobile-lock/passkey/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ response: assertion }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Passkey unlock failed.");
      setLocked(false);
      setOtpRequested(false);
      setOtp("");
      await refreshLockState();
      router.refresh();
      toast.success("App unlocked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Passkey unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  const requestOtp = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/mobile-lock/otp/request", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok) {
        const retryAfter = Number(result.retryAfterSeconds || response.headers.get("Retry-After"));
        if (Number.isFinite(retryAfter) && retryAfter > 0) setResendIn(retryAfter);
        throw new Error(result.error || "Could not send unlock code.");
      }
      setOtpRequested(true);
      setOtpExpiresIn(result.expiresInSeconds || 300);
      setResendIn(result.resendInSeconds || 60);
      setOtp("");
      toast.success(`Code sent to ${result.destination || "your registered phone"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not send unlock code.");
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/mobile-lock/otp/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp }), cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Incorrect unlock code.");
      setLocked(false);
      setOtpRequested(false);
      setOtp("");
      await refreshLockState();
      router.refresh();
      toast.success("App unlocked.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unlock failed.");
    } finally {
      setBusy(false);
    }
  };

  if (!enabled || !locked) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 p-5 backdrop-blur-xl" role="dialog" aria-modal="true" aria-labelledby="mobile-app-lock-title">
      <div className="w-full max-w-sm rounded-3xl border bg-card p-6 shadow-2xl">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="size-6" /></div>
        <h2 id="mobile-app-lock-title" className="text-xl font-semibold">App locked</h2>
        <p className="mt-2 text-sm text-muted-foreground">For your security, unlock to continue. Protected data remains unavailable until verification succeeds.</p>
        {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        {!otpRequested ? <div className="mt-6 flex flex-col gap-3">
          <Button type="button" disabled={busy} onClick={() => void unlockWithPasskey()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Fingerprint className="mr-2 size-4" />}Unlock with passkey</Button>
          <Button type="button" variant="outline" disabled={busy} onClick={() => void requestOtp()}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShieldCheck className="mr-2 size-4" />}Use registered-phone OTP</Button>
        </div> : <form className="mt-6 flex flex-col gap-3" onSubmit={verifyOtp}>
          <Label htmlFor="mobile-lock-otp">Six-digit code</Label>
          <Input id="mobile-lock-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} required />
          <p aria-live="polite" className="text-xs text-muted-foreground">{otpExpiresIn > 0 ? `Code expires in ${otpExpiresIn}s` : "Code expired."} · {resendIn > 0 ? `Resend in ${resendIn}s` : "You can request a new code."}</p>
          <Button type="submit" disabled={busy || otp.length !== 6}>{busy && <Loader2 className="mr-2 size-4 animate-spin" />}Verify and unlock</Button>
          <Button type="button" variant="ghost" disabled={busy || resendIn > 0} onClick={() => void requestOtp()}>{resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}</Button>
        </form>}
      </div>
    </div>
  );
}