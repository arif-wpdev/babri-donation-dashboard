import { LoginForm } from "./login-form";
import { env } from "@/env";

export default async function LoginPage(props: { searchParams: Promise<{ callbackUrl?: string; phone?: string }> }) {
  const searchParams = await props.searchParams;
  const requestedCallback = searchParams?.callbackUrl || "/dashboard";
  const callbackUrl = requestedCallback.startsWith("/") && !requestedCallback.startsWith("//") ? requestedCallback : "/dashboard";

  return (
    <main className="min-h-screen min-h-dvh flex flex-col justify-center items-center bg-[#f8faf9] px-4 py-8 sm:py-12 relative selection:bg-emerald-100 selection:text-emerald-900">
      {/* Subtle modern background gradient grid - pure minimal aesthetics */}
      <div 
        aria-hidden="true" 
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:24px_24px] opacity-60" 
      />

      <div className="w-full max-w-[420px] bg-white rounded-3xl p-6 sm:p-9 shadow-[0_12px_40px_-10px_rgba(0,0,0,0.06)] border border-slate-200/80 relative z-10 flex flex-col items-center">
        {/* Brand header */}
        <div className="flex flex-col items-center mb-7 w-full text-center">
          <div className="size-16 rounded-2xl bg-white shadow-sm ring-1 ring-slate-900/5 p-2.5 flex items-center justify-center mb-4 transition-transform hover:scale-105 duration-200">
            <img 
              src="/logo.png" 
              alt="Babri Masjid" 
              className="w-full h-full object-contain" 
            />
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            Babri Masjid
          </h1>
          <p className="text-xs sm:text-sm font-medium text-emerald-800 bg-emerald-50/90 border border-emerald-100/80 px-3 py-0.5 rounded-full mt-1.5">
            Donation Dashboard
          </p>
          <p className="text-xs sm:text-sm text-slate-500 mt-2">
            Sign in to manage funds and analytics
          </p>
        </div>

        {/* Auth form */}
        <LoginForm 
          callbackUrl={callbackUrl} 
          mfaEnabled={env.AUTH_MFA_ENABLED === "true"} 
          invitedPhone={searchParams?.phone ?? ""} 
        />
      </div>

      {/* Clean minimal footer */}
      <footer className="mt-6 text-center text-xs text-slate-400 relative z-10">
        Protected by end-to-end multi-factor authentication
      </footer>
    </main>
  );
}

