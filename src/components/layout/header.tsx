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
  }
  
  const displayTitle = title === "TDF Donation Dashboard" ? title : (title.charAt(0).toUpperCase() + title.slice(1));

  // Format today's date
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <header className="flex h-20 shrink-0 items-center justify-between gap-2 px-6 lg:px-8 border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex items-center gap-4">
        <SidebarTrigger className="-ml-1 text-muted-foreground hover:text-foreground transition-colors" />
        <Separator orientation="vertical" className="mr-2 h-6 bg-border/60" />
        <div className="flex flex-col">
          <h1 className="text-xl font-bold tracking-tight">{displayTitle}</h1>
          <p className="text-sm text-muted-foreground">{today}</p>
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
