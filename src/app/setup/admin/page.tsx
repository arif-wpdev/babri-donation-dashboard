import Link from "next/link";
import { SuperAdminPhoneSetup } from "@/app/login/super-admin-phone-setup";

export default function SuperAdminSetupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6"><p className="text-sm font-medium text-primary">Secure account setup</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Verify administrator phone</h1><p className="mt-2 text-sm text-muted-foreground">This page exposes no organization data. Prove your existing administrator email and password, then verify the phone you will use for future sign-in.</p></div>
        <SuperAdminPhoneSetup />
        <p className="mt-6 text-center text-sm text-muted-foreground"><Link className="text-primary underline" href="/login">Return to sign in</Link></p>
      </section>
    </main>
  );
}