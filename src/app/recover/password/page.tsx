import { PasswordRecoveryForm } from "@/components/auth/password-recovery-form";

export default function PasswordRecoveryPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6"><p className="text-sm font-medium text-primary">Account recovery</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Reset a legacy password</h1><p className="mt-2 text-sm text-muted-foreground">Use the phone number already verified on your password-backed account.</p></div>
        <PasswordRecoveryForm />
      </section>
    </main>
  );
}