import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { LoginForm } from "./login-form";

export default async function LoginPage(props: { searchParams: Promise<{ callbackUrl: string | undefined }> }) {
  const searchParams = await props.searchParams;
  const callbackUrl = searchParams?.callbackUrl || "/dashboard";

  async function authenticate(formData: FormData) {
    "use server";
    try {
      await signIn("credentials", formData);
    } catch (error) {
      if (error instanceof AuthError) {
        switch (error.type) {
          case "CredentialsSignin":
            return "Invalid email or password.";
          default:
            return "Something went wrong.";
        }
      }
      throw error;
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background/50 relative overflow-hidden">
      {/* Decorative background shapes */}
      <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[100px] -mr-40 -mt-40 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-[80px] -ml-20 -mb-20 pointer-events-none" />

      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative z-10 border border-border/50 flex flex-col items-center">
        <div className="flex flex-col items-center mb-8 w-full text-center">
          <div className="h-12 flex items-center justify-center mb-4">
            <img 
              src="/logo.png" 
              alt="Logo" 
              className="h-full object-contain" 
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Babri Masjid Donation Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter your credentials to access dashboard
          </p>
        </div>

        <LoginForm authenticate={authenticate} callbackUrl={callbackUrl} />
      </div>
    </div>
  );
}

