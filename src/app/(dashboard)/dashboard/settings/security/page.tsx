import { SecuritySettings } from "@/components/settings/security-settings";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { requireStrongSession } from "@/lib/auth-security";

export default async function SecuritySettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  try {
    await requireStrongSession(session.user);
  } catch {
    redirect("/login");
  }
  return <div className="mx-auto max-w-4xl"><SecuritySettings /></div>;
}
