import { InviteSetupEntry } from "@/components/admin/invite-setup-entry";
import { EmployeePhoneSetup } from "@/app/login/employee-phone-setup";

export default async function SetupPage(props: { searchParams: Promise<{ phone?: string }> }) {
  const { phone = "" } = await props.searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6"><p className="text-sm font-medium text-primary">Account setup</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Verify your registered phone</h1><p className="mt-2 text-sm text-muted-foreground">Complete the invitation from your administrator. Your phone must match the number registered for this account.</p></div>
        {phone ? <EmployeePhoneSetup initialPhone={phone} /> : <InviteSetupEntry />}
      </section>
    </main>
  );
}