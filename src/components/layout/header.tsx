"use client";

import { Bell, Search, Mail, LogOut, ShieldCheck } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePathname } from "next/navigation";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import Link from "next/link";
import { useAdSpend } from "@/hooks/use-ad-spend";

export function Header({ user }: { user?: { name?: string | null, email?: string | null, role?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const isDashboardHome = pathname === "/dashboard";
  const { data: adSpend, isLoading: isAdSpendLoading, isError: isAdSpendError } = useAdSpend(null);
  const pathSegments = pathname.split("/").filter(Boolean);

  let title = pathSegments[pathSegments.length - 1] || "Babri Masjid Donation Dashboard";

  if (title === "dashboard") {
    title = "Babri Masjid Donation Dashboard";
  } else if (pathSegments[0] === "dashboard" && pathSegments[1] === "donors" && pathSegments.length === 3) {
    title = "Donor Profile";
  } else if (pathSegments[0] === "dashboard" && pathSegments[1] === "funds" && pathSegments.length === 3) {
    title = "Fund Details";
  }

  let displayTitle = title === "Babri Masjid Donation Dashboard" ? title : (title.charAt(0).toUpperCase() + title.slice(1));

  if (title === "funds") displayTitle = "Funds Overview";
  else if (title === "donors") displayTitle = "Donor Directory";
  else if (title === "donations") displayTitle = "Transactions";
  else if (title === "reports") displayTitle = "UTM Analytics";
  else if (title === "team") displayTitle = "Team Management";
  // Compact date to reduce header clutter.
  const today = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "2-digit",
    timeZone: "Asia/Dhaka",
  }).format(new Date());
  const availableBalance = adSpend?.balance;
  const formattedBalance = availableBalance === undefined
    ? "—"
    : `৳${availableBalance.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;

  return (
    <header className="flex h-20 shrink-0 items-center justify-between gap-2 px-6 lg:px-8 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors hidden md:block" />
        <Separator orientation="vertical" className="h-6 bg-border/60 hidden md:block" />

        {/* Mobile Logo */}
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 md:hidden overflow-hidden">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-sm font-bold font-serif italic text-primary">BD</span>'; }} />
        </div>

        <div className="flex flex-col min-w-0">
          <h1 className="text-base md:text-xl font-bold tracking-tight truncate leading-tight">{displayTitle}</h1>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{today}</p>
          {isDashboardHome && (
            <Link
              href="/dashboard/reports#facebook-ads"
              className="mt-0.5 inline-flex w-fit items-center gap-1 text-xs font-semibold text-emerald-800 hover:text-emerald-950 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              aria-label="Facebook Ads available balance; open ad spend report"
            >
              <Wallet className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">Ads balance: {isAdSpendLoading ? "Loading…" : isAdSpendError ? "Unavailable" : formattedBalance}</span>
            </Link>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">


        <DropdownMenu>
          <DropdownMenuTrigger className="outline-none">
            <div className="flex items-center gap-3 pl-2 border-l border-border/40 cursor-pointer hover:opacity-80 transition-opacity">
              <div className="flex flex-col items-end hidden md:flex">
                <span className="text-sm font-semibold leading-none mb-1">
                  {user?.name || (user?.role === "ORG_USER" ? "Employee" : "Admin")}
                </span>
                <span className="text-xs text-muted-foreground leading-none">{user?.email || "No email"}</span>
              </div>
              <Avatar className="size-10 border-2 border-white shadow-sm">
                <AvatarImage src="" alt={user?.name || "User"} />
                <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                  {(user?.name?.[0] || user?.email?.[0] || "U").toUpperCase()}
                </AvatarFallback>
              </Avatar>
            </div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 mt-2">
            <div className="flex items-center justify-start gap-2 p-2">
              <div className="flex flex-col space-y-1 leading-none">
                {user?.name && <p className="font-medium">{user.name}</p>}
                {user?.email && (
                  <p className="w-[200px] truncate text-sm text-muted-foreground">
                    {user.email}
                  </p>
                )}
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/dashboard/settings/security")}>
              <ShieldCheck className="mr-2 h-4 w-4" /><span>Security & devices</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600 focus:bg-red-50 cursor-pointer"
              onClick={async () => {
                await fetch("/api/auth/mfa/logout", { method: "POST" });
                router.push("/login");
                router.refresh();
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              <span>Log out</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
