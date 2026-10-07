"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

declare global {
  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent;
    appinstalled: Event;
  }
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isDesktop() {
  return !/android|iphone|ipod|ipad|mobile/i.test(navigator.userAgent) &&
    !(navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [manualInstall, setManualInstall] = useState(false);

  useEffect(() => {
    if (isInstalled()) return;
    const stored = localStorage.getItem("pwa_prompt_dismissed");
    const dismissedRecently = stored !== null && Date.now() - Number(stored) < 7 * 24 * 60 * 60 * 1000;
    if (dismissedRecently) return;

    let showTimer: number | undefined;
    let installEventCaptured = false;
    const showAfterDelay = () => {
      if (isInstalled()) return;
      showTimer = window.setTimeout(() => setShowPrompt(true), 1800);
    };
    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      installEventCaptured = true;
      setDeferredPrompt(event);
      setManualInstall(false);
      showAfterDelay();
    };
    const onAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setManualInstall(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    // Safari and some Chromium desktop configurations do not dispatch
    // beforeinstallprompt. Show an install-help card instead of failing silently.
    const manualTimer = window.setTimeout(() => {
      if (!installEventCaptured && !isInstalled() && isDesktop()) {
        setManualInstall(true);
        setShowPrompt(true);
      }
    }, 3500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      if (showTimer !== undefined) window.clearTimeout(showTimer);
      window.clearTimeout(manualTimer);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) {
      setManualInstall(true);
      return;
    }
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    if (outcome === "accepted") setShowPrompt(false);
  };

  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const manualInstructions = /Safari/i.test(userAgent) && !/Chrome|Chromium|Edg/i.test(userAgent)
    ? "Choose File → Add to Dock in Safari to open it like an app."
    : /Chrome|Chromium|Edg/i.test(userAgent)
      ? "Choose Install app from your browser menu to open it like an app."
      : "Use a supported desktop browser’s Install app option to open it like an app.";

  const dismiss = () => {
    setShowPrompt(false);
    localStorage.setItem("pwa_prompt_dismissed", String(Date.now()));
  };

  if (!showPrompt || isInstalled()) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 pb-safe animate-in slide-in-from-bottom-full duration-500">
      <div className="relative mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-white p-4 shadow-2xl sm:flex-row">
        <button onClick={dismiss} aria-label="Dismiss install help" className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
          <X className="size-4" />
        </button>
        <div className="size-12 shrink-0 rounded-xl bg-primary/10 p-2">
          <Image src="/icon-192.png" alt="" width={48} height={48} className="size-full object-contain" />
        </div>
        <div className="flex-1 pr-6 text-center sm:text-left">
          <h3 className="text-sm font-semibold text-foreground">Install Donation Dashboard</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {manualInstall
              ? manualInstructions
              : "Install for quick, app-like access."}
          </p>
        </div>
        {!manualInstall && <Button onClick={() => void handleInstall()} className="h-9 w-full shrink-0 gap-2 rounded-xl sm:w-auto">
          <Download className="size-4" />Install
        </Button>}
      </div>
    </div>
  );
}