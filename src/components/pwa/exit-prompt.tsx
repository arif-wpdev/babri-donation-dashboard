"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";

export function ExitPrompt() {
  const pathname = usePathname();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    
    // Only apply in standalone mode (PWA)
    if (!window.matchMedia("(display-mode: standalone)").matches) return;

    // We only trap the back button on the main dashboard page
    if (pathname !== "/dashboard") return;

    // Push the hash state if it's not already there
    // This creates a "dummy" forward state that we can pop
    if (window.location.hash !== "#pwa-exit") {
      window.history.pushState(null, "", window.location.pathname + "#pwa-exit");
    }

    const handlePopState = () => {
      // If the user pressed back and the hash was removed
      if (window.location.hash !== "#pwa-exit" && window.location.pathname === "/dashboard") {
        toast("Press back again to exit", { 
          position: "bottom-center",
          duration: 2000,
        });

        // If they don't press back again within 2 seconds, re-add the hash
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => {
          if (window.location.pathname === "/dashboard" && window.location.hash !== "#pwa-exit") {
            window.history.pushState(null, "", window.location.pathname + "#pwa-exit");
          }
        }, 2000);
      }
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [pathname]);

  return null;
}
