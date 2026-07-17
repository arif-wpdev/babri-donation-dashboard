"use client";

import { Bell, Search, Mail } from "lucide-react";
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
import { usePathname } from "next/navigation";

export function Header({ user }: { user?: { name?: string | null, email?: string | null, role?: string } }) {
  const pathname = usePathname();
  const pathSegments = pathname.split("/").filter(Boolean);
  
  let title = pathSegments[pathSegments.length - 1] || "TDF Donation Dashboard";
  
  if (title === "dashboard") {
    title = "TDF Donation Dashboard";
  } else if (pathSegments[0] === "dashboard" && pathSegments[1] === "donors" && pathSegments.length === 3) {
    title = "Donor Profile";
  } else if (pathSegments[0] === "dashboard" && pathSegments[1] === "funds" && pathSegments.length === 3) {
    title = "Fund Details";
  }
  
  let displayTitle = title === "TDF Donation Dashboard" ? title : (title.charAt(0).toUpperCase() + title.slice(1));

  if (title === "funds") displayTitle = "Funds Overview";
  else if (title === "donors") displayTitle = "Donor Directory";
  else if (title === "donations") displayTitle = "Transactions";
  else if (title === "reports") displayTitle = "UTM Analytics";
  else if (title === "team") displayTitle = "Team Management";
  // Format today's date
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="flex h-20 shrink-0 items-center justify-between gap-2 px-6 lg:px-8 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors hidden md:block" />
        <Separator orientation="vertical" className="h-6 bg-border/60 hidden md:block" />
        
        {/* Mobile Logo */}
        <div className="size-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 md:hidden overflow-hidden">
          <img src="/logo.png" alt="TDF Logo" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-sm font-bold font-serif italic text-primary">TDF</span>'; }} />
        </div>

        <div className="flex flex-col min-w-0">
          <h1 className="text-base md:text-xl font-bold tracking-tight truncate leading-tight">{displayTitle}</h1>
          <p className="text-xs md:text-sm text-muted-foreground truncate">{today}</p>
        </div>
      </div>
      
      <div className="flex items-center gap-6">

        
        <div className="flex items-center gap-3 pl-2 border-l border-border/40">
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
      </div>
    </header>
  );
}
