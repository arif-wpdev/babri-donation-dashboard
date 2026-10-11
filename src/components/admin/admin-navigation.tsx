"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { Building2, Users, UserRoundCog, ShieldCheck, ArrowLeft, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { triggerNavProgress } from "@/components/layout/top-progress-bar";

export function AdminNavigation({ role }: { role: string }) {
  const pathname = usePathname();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  // Clear pending state once the route finishes changing
  useEffect(() => {
    setPendingHref(null);
  }, [pathname]);

  const links = role === "SUPER_ADMIN"
    ? [
        { href: "/admin/organizations", label: "Organizations", icon: Building2 },
        { href: "/admin/accounts", label: "Accounts", icon: Users },
        { href: "/admin/security", label: "Security & setup", icon: ShieldCheck },
      ]
    : [
        { href: "/admin", label: "Overview", icon: UserRoundCog },
        { href: "/admin/accounts", label: "Team", icon: Users },
        { href: "/admin/security", label: "Security", icon: ShieldCheck },
      ];

  const handleNavClick = (href: string) => {
    if (pathname !== href) {
      setPendingHref(href);
      triggerNavProgress();
    }
  };

  const isDashboardActive = pathname === "/dashboard";
  const isDashboardPending = pendingHref === "/dashboard";

  return (
    <nav aria-label="Admin navigation" className="flex flex-wrap items-center gap-2">
      <Link
        href="/dashboard"
        onClick={() => handleNavClick("/dashboard")}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-xl border px-3 text-sm font-medium transition-all active:scale-95",
          isDashboardActive
            ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 shadow-xs font-semibold"
            : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
        )}
      >
        {isDashboardPending ? (
          <Loader2 className="size-4 animate-spin text-emerald-600" />
        ) : (
          <ArrowLeft className="size-4" />
        )}
        <span>Dashboard</span>
      </Link>

      {links.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || (href !== "/admin" && pathname.startsWith(href));
        const isPending = pendingHref === href;

        return (
          <Link
            key={href}
            href={href}
            onClick={() => handleNavClick(href)}
            className={cn(
              "inline-flex h-10 items-center gap-2 rounded-xl border px-3.5 text-sm font-medium transition-all active:scale-95",
              isActive
                ? "border-emerald-500/30 bg-emerald-50/90 text-emerald-900 font-semibold shadow-xs ring-1 ring-emerald-500/20 dark:border-emerald-700/50 dark:bg-emerald-950/40 dark:text-emerald-200"
                : "border-border/60 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
            )}
          >
            {isPending ? (
              <Loader2 className="size-4 animate-spin text-emerald-600" />
            ) : (
              <Icon className={cn("size-4", isActive ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")} />
            )}
            <span>{label}</span>
            {isActive && (
              <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400 ml-0.5" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}