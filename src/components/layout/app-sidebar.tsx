"use client";

import * as React from "react";
import {
  LayoutDashboard,
  PieChart,
  Users,
  Settings,
  HelpCircle,
  FileText,
  CreditCard,
  Target,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
} from "@/components/ui/sidebar";

const navMain = [
  {
    title: "Menu",
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: LayoutDashboard,
      },
      {
        title: "Funds",
        url: "/dashboard/funds",
        icon: Target,
      },
      {
        title: "Donors",
        url: "/dashboard/donors",
        icon: Users,
      },
    ],
  },

  {
    title: "Tools",
    items: [
      {
        title: "Team",
        url: "/dashboard/team",
        icon: Users,
      },
      {
        title: "Settings",
        url: "/dashboard/settings",
        icon: Settings,
      },
      {
        title: "Help",
        url: "/dashboard/help",
        icon: HelpCircle,
      },
    ],
  },
];

export function AppSidebar({ userRole, ...props }: React.ComponentProps<typeof Sidebar> & { userRole?: string }) {
  const pathname = usePathname();

  // Filter navigation items based on role
  const filteredNavMain = navMain.map(group => {
    if (userRole === "ORG_USER" && group.title === "Tools") {
      return {
        ...group,
        items: group.items.filter(item => item.title !== "Settings" && item.title !== "Team")
      };
    }
    return group;
  }).filter(group => group.items.length > 0);

  return (
    <Sidebar variant="inset" {...props}>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex aspect-square size-10 items-center justify-center overflow-hidden">
            <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement!.innerHTML = '<span class="text-xl font-bold font-serif italic text-primary">BD</span>'; }} />
          </div>
          <div className="flex flex-col gap-0.5 leading-none">
            <span className="font-semibold text-lg">Donations</span>
            <span className="text-xs text-sidebar-foreground/70">
              Analytics
            </span>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {filteredNavMain.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel className="text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/50 px-4 py-2">
              {group.title}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        render={<Link href={item.url} />}
                        isActive={isActive}
                        className={`flex items-center gap-3 px-4 py-6 transition-colors rounded-r-full mr-4 ${isActive
                            ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground font-medium"
                            : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                          }`}
                      >
                        <item.icon className={`size-5 ${isActive ? "text-primary-foreground" : "text-sidebar-foreground/60"}`} />
                        <span>{item.title}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
