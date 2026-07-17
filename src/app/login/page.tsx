import { signIn } from "@/lib/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";

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
            return redirect(`/login?error=Invalid credentials`);
          default:
            return redirect(`/login?error=Something went wrong`);
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

      <div className="w-full max-w-md bg-white rounded-3xl p-8 shadow-[0_8px_40px_rgba(0,0,0,0.04)] relative z-10 border border-border/50">
        <div className="flex flex-col items-center mb-8">
          <div className="h-12 flex items-center justify-center mb-4">
            <img 
              src="/logo.png" 
              alt="TDF Logo" 
              className="h-full object-contain" 
            />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Welcome back</h1>
          <p className="text-sm text-muted-foreground mt-1 text-center">
            Enter your credentials to access the analytics hub
          </p>
        </div>

        <form action={authenticate} className="flex flex-col gap-5">
          <input type="hidden" name="redirectTo" value={callbackUrl} />
          
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              placeholder="admin@donationinsight.com"
              className="h-11 rounded-xl bg-background/50"
            />
          </div>
          
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
            </div>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="h-11 rounded-xl bg-background/50"
            />
          </div>

          <button
            type="submit"
            className="h-11 w-full bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-medium shadow-sm transition-colors mt-2"
          >
            Sign in to Dashboard
          </button>
        </form>
      </div>
    </div>
  );
}
