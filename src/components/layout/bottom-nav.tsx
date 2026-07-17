"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Users, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const bottomNavItems = [
  {
    title: "Home",
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
  {
    title: "Settings",
    url: "/dashboard/settings",
    icon: Settings,
  },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div className="md:hidden fixed bottom-6 left-6 right-6 z-50 bg-primary/80 backdrop-blur-[6px] backdrop-saturate-150 shadow-[0_8px_30px_rgb(13,71,43,0.3)] rounded-3xl supports-[backdrop-filter]:bg-primary/80">
      <nav className="flex justify-around items-center h-[72px] px-2">
        {bottomNavItems.map((item) => {
          // Check if it's the exact path for dashboard, or starts with it for other routes
          const isActive = item.url === "/dashboard" 
            ? pathname === "/dashboard" 
            : pathname.startsWith(item.url);

          return (
            <Link
              key={item.title}
              href={item.url}
              className="relative flex flex-col items-center justify-center w-full h-full"
            >
              <div
                className={cn(
                  "flex flex-col items-center justify-center transition-all duration-300",
                  isActive 
                    ? "bg-white text-primary shadow-sm scale-105 size-12 rounded-full" 
                    : "text-white/80 hover:text-white hover:bg-white/10 scale-95 hover:scale-100 w-16 py-1.5 rounded-2xl"
                )}
              >
                <item.icon className={cn("w-5 h-5", !isActive && "mb-1")} strokeWidth={isActive ? 2.5 : 2} />
                
                {!isActive && (
                  <span className="text-[10px] font-semibold tracking-wide">
                    {item.title}
                  </span>
                )}
              </div>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
