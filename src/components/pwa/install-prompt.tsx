"use client";

import { useEffect, useState } from "react";
import { X, Download } from "lucide-react";
import { Button } from "@/components/ui/button";

// Extend the Window interface for the beforeinstallprompt event
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    // Check if the user already dismissed the prompt recently
    const hasDismissed = localStorage.getItem("pwa_prompt_dismissed");
    if (hasDismissed) {
      const dismissedAt = parseInt(hasDismissed, 10);
      const now = new Date().getTime();
      // If dismissed within the last 7 days, don't show
      if (now - dismissedAt < 7 * 24 * 60 * 60 * 1000) {
        return;
      }
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent Chrome 67 and earlier from automatically showing the prompt
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // Show the prompt UI after a small delay so it doesn't interrupt the initial page load instantly
      setTimeout(() => {
        setShowPrompt(true);
      }, 3000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    
    // Hide our UI
    setShowPrompt(false);
    
    // Show the browser's install prompt
    deferredPrompt.prompt();
    
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    
    if (outcome === "accepted") {
      console.log("User accepted the install prompt");
    } else {
      console.log("User dismissed the install prompt");
    }
    
    // Clear the saved prompt since it can't be used again
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    // Save to local storage so we don't annoy the user immediately again
    localStorage.setItem("pwa_prompt_dismissed", new Date().getTime().toString());
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pb-safe animate-in slide-in-from-bottom-full duration-500">
      <div className="max-w-md mx-auto bg-white border border-border shadow-2xl rounded-2xl p-4 relative flex flex-col sm:flex-row items-center gap-4">
        <button 
          onClick={handleDismiss}
          className="absolute right-2 top-2 p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted rounded-full transition-colors"
        >
          <X className="size-4" />
        </button>
        
        <div className="size-12 shrink-0 bg-primary/10 rounded-xl flex items-center justify-center p-2">
          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
        </div>
        
        <div className="flex-1 text-center sm:text-left pr-6 sm:pr-0">
          <h3 className="font-semibold text-foreground text-sm">Install Dashboard</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Add to your home screen for quick and easy access.</p>
        </div>
        
        <Button 
          onClick={handleInstallClick}
          className="w-full sm:w-auto shrink-0 gap-2 h-9 rounded-xl"
        >
          <Download className="size-4" />
          Install
        </Button>
      </div>
    </div>
  );
}
