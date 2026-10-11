"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { usePathname } from "next/navigation";

export function TopProgressBar() {
  const pathname = usePathname();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);
  const timersRef = useRef<NodeJS.Timeout[]>([]);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const startProgress = () => {
    clearTimers();
    setVisible(true);
    setProgress(25);

    const t1 = setTimeout(() => {
      setProgress(60);
    }, 200);

    const t2 = setTimeout(() => {
      setProgress(80);
    }, 500);

    const t3 = setTimeout(() => {
      setProgress(90);
    }, 1200);

    timersRef.current = [t1, t2, t3];
  };

  const completeProgress = () => {
    clearTimers();
    setProgress(100);
    const t = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 250);
    timersRef.current = [t];
  };

  // Complete progress whenever the route pathname finishes changing
  useEffect(() => {
    if (visible) {
      completeProgress();
    }
  }, [pathname]);

  // Global listener for click on any internal links or custom events
  useEffect(() => {
    const handleStartEvent = () => startProgress();
    const handleStopEvent = () => completeProgress();

    window.addEventListener("start-nav-progress", handleStartEvent);
    window.addEventListener("stop-nav-progress", handleStopEvent);

    const handleClick = (e: MouseEvent) => {
      // Find closest anchor tag
      const target = (e.target as HTMLElement)?.closest("a");
      if (!target) return;

      const href = target.getAttribute("href");
      if (!href) return;

      // Ignore external links, new tabs, hashes, and modifier clicks
      if (
        target.target === "_blank" ||
        e.ctrlKey ||
        e.metaKey ||
        e.shiftKey ||
        e.altKey ||
        href.startsWith("#") ||
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      // If clicking current exact path, don't trigger
      if (href === pathname) return;

      // Start progress immediately
      startProgress();
    };

    document.addEventListener("click", handleClick, { capture: true });

    return () => {
      clearTimers();
      window.removeEventListener("start-nav-progress", handleStartEvent);
      window.removeEventListener("stop-nav-progress", handleStopEvent);
      document.removeEventListener("click", handleClick, { capture: true });
    };
  }, [pathname]);

  if (!visible && progress === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="fixed top-0 left-0 right-0 z-[999999] pointer-events-none h-[3px] bg-transparent"
    >
      <div
        className="h-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-400 shadow-[0_0_10px_rgba(16,185,129,0.9),0_0_2px_rgba(16,185,129,0.9)] transition-all duration-300 ease-out"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          transitionProperty: "width, opacity",
        }}
      />
    </div>
  );
}

export function triggerNavProgress() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("start-nav-progress"));
  }
}
