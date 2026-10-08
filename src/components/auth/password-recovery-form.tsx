"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PasswordRecoveryForm() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState<"request" | "verify">("request");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const requestCode = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/auth/mfa/password-reset/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: phone }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Recovery request could not be processed.");
      setStep("verify");
      setMessage(result.message || "If the account is eligible, a reset code will be sent to its verified phone.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Recovery request could not be processed.");
    } finally {
      setPending(false);
    }
  };

  const resetPassword = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/auth/mfa/password-reset/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ identifier: phone, otp, newPassword }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Password reset could not be completed.");
      toast.success("Password reset. Sign in with your new password.");
      router.replace("/login");
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password reset could not be completed.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl bg-muted/50 p-4 text-sm text-muted-foreground"><ShieldCheck className="mr-2 inline size-4 text-primary" />Recovery codes go only to an account&apos;s already verified registered phone. Phone-only passwordless accounts cannot be given a password through this flow.</div>
      {message && <p role="status" className="rounded-lg border bg-muted/30 p-3 text-sm">{message}</p>}
      {error && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      {step === "request" ? <form onSubmit={requestCode} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="recovery-phone">Verified account phone</Label><Input id="recovery-phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="+8801XXXXXXXXX" required value={phone} onChange={(event) => setPhone(event.target.value)} /></div>
        <Button type="submit" disabled={pending} className="w-full">{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Send recovery code</Button>
      </form> : <form onSubmit={resetPassword} className="space-y-4">
        <div className="space-y-2"><Label htmlFor="recovery-otp">6-digit SMS code</Label><Input id="recovery-otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))} /></div>
        <div className="space-y-2"><Label htmlFor="recovery-new-password">New password</Label><Input id="recovery-new-password" type="password" autoComplete="new-password" minLength={12} maxLength={256} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /><p className="text-xs text-muted-foreground">At least 12 characters, including uppercase, lowercase, and a number.</p></div>
        <Button type="submit" disabled={pending || otp.length !== 6} className="w-full">{pending && <Loader2 className="mr-2 size-4 animate-spin" />}Reset password</Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={() => { setStep("request"); setOtp(""); setNewPassword(""); }} className="w-full"><ArrowLeft className="mr-2 size-4" />Use another phone</Button>
      </form>}
      <p className="text-center text-sm text-muted-foreground"><Link href="/login" className="text-primary underline">Return to login</Link></p>
    </div>
  );
}