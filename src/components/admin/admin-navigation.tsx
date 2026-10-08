import Link from "next/link";
import { Building2, Users, UserRoundCog, ShieldCheck } from "lucide-react";

export function AdminNavigation({ role }: { role: string }) {
  const links = role === "SUPER_ADMIN"
    ? [{ href: "/admin/organizations", label: "Organizations", icon: Building2 }, { href: "/admin/accounts", label: "Accounts", icon: Users }, { href: "/admin/security", label: "Security & setup", icon: ShieldCheck }]
    : [{ href: "/admin", label: "Overview", icon: UserRoundCog }, { href: "/admin/accounts", label: "Team", icon: Users }, { href: "/admin/security", label: "Security", icon: ShieldCheck }];

  return (
    <nav aria-label="Admin navigation" className="flex flex-wrap gap-2">
      {links.map(({ href, label, icon: Icon }) => (
        <Link key={href} href={href} className="inline-flex h-10 items-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition-colors hover:bg-accent">
          <Icon className="size-4 text-primary" />{label}
        </Link>
      ))}
    </nav>
  );
}