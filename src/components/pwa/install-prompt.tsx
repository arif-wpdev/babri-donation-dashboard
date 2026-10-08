"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, MoreVertical, Share, X } from "lucide-react";
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

function getInstallHelp() {
  const ua = navigator.userAgent;
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|CriOS|FxiOS/i.test(ua);
  const android = /Android/i.test(ua);
  if (ios && safari) return { icon: Share, text: "Tap Share, then choose Add to Home Screen." };
  if (android) return { icon: MoreVertical, text: "Open your browser menu and choose Install app or Add to Home screen." };
  if (safari) return { icon: MoreVertical, text: "From Safari's File menu, choose Add to Dock." };
  return { icon: MoreVertical, text: "Open your browser menu and choose Install app or Create shortcut." };
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [installHelp, setInstallHelp] = useState<{ icon: typeof MoreVertical; text: string } | null>(null);
  const [installing, setInstalling] = useState(false);

  const handleInstall = useCallback(async () => {
    if (isInstalled()) {
      setInstalled(true);
      setShowPrompt(false);
      return;
    }
    if (!deferredPrompt) {
      setInstallHelp(getInstallHelp());
      setShowPrompt(true);
      return;
    }

    setInstalling(true);
    try {
      const promptEvent = deferredPrompt;
      setDeferredPrompt(null);
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === "accepted") {
        setShowPrompt(false);
        setInstallHelp(null);
      } else {
        setInstallHelp(getInstallHelp());
        setShowPrompt(true);
      }
    } catch {
      setInstallHelp(getInstallHelp());
      setShowPrompt(true);
    } finally {
      setInstalling(false);
    }
  }, [deferredPrompt]);

  useEffect(() => {
    const standaloneMedia = window.matchMedia("(display-mode: standalone)");
    const syncInstalled = () => setInstalled(isInstalled());
    syncInstalled();
    standaloneMedia.addEventListener("change", syncInstalled);
    if (isInstalled()) return () => standaloneMedia.removeEventListener("change", syncInstalled);

    let showTimer: number | undefined;
    const onBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
      setInstallHelp(null);
      window.clearTimeout(showTimer);
      showTimer = window.setTimeout(() => {
        if (!isInstalled()) setShowPrompt(true);
      }, 800);
    };
    const onAppInstalled = () => {
      setShowPrompt(false);
      setDeferredPrompt(null);
      setInstallHelp(null);
      setInstalled(true);
    };
    const onOpenInstall = () => void handleInstall();

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    window.addEventListener("open-pwa-install", onOpenInstall);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
      window.removeEventListener("open-pwa-install", onOpenInstall);
      standaloneMedia.removeEventListener("change", syncInstalled);
      if (showTimer !== undefined) window.clearTimeout(showTimer);
    };
  }, [handleInstall]);

  const dismiss = () => {
    setShowPrompt(false);
    setInstallHelp(null);
  };

  const HelpIcon = installHelp?.icon;

  return (
    <>
      {!installed && <Button type="button" variant="outline" size="sm" onClick={() => void handleInstall()} className="fixed bottom-4 right-4 z-40 gap-2 rounded-full border-primary/30 bg-background/95 shadow-lg backdrop-blur md:bottom-6 md:right-6" aria-label="Install Donation Dashboard"><Download className="size-4" />Install app</Button>}

      {showPrompt && !installed && <div className="fixed bottom-16 left-0 right-0 z-50 p-4 md:bottom-20 md:p-6 pb-safe animate-in slide-in-from-bottom-full duration-300">
        <div className="relative mx-auto flex max-w-md flex-col items-center gap-4 rounded-2xl border border-border bg-background p-4 shadow-2xl sm:flex-row">
          <button onClick={dismiss} aria-label="Dismiss install help" className="absolute right-2 top-2 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><X className="size-4" /></button>
          <div className="size-12 shrink-0 rounded-xl bg-primary/10 p-2"><Image src="/icon-192.png" alt="" width={48} height={48} className="size-full object-contain" /></div>
          <div className="flex-1 pr-6 text-center sm:text-left"><h3 className="text-sm font-semibold text-foreground">Install Donation Dashboard</h3><p className="mt-0.5 text-xs text-muted-foreground">{installHelp?.text ?? "Install for quick, app-like access."}</p></div>
          {installHelp && HelpIcon ? <HelpIcon className="hidden size-5 shrink-0 text-muted-foreground sm:block" /> : null}
          {!installHelp && <Button type="button" onClick={() => void handleInstall()} disabled={installing} className="h-9 w-full shrink-0 gap-2 rounded-xl sm:w-auto"><Download className="size-4" />{installing ? "Opening…" : "Install"}</Button>}
        </div>
      </div>}
    </>
  );
}