import { cn } from "@/lib/utils";

interface OverlayLoaderProps {
  visible: boolean;
  message?: string;
  className?: string;
}

export function OverlayLoader({ visible, message = "Please wait...", className }: OverlayLoaderProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/30 backdrop-blur-md animate-in fade-in duration-200",
        className
      )}
    >
      <div className="flex flex-col items-center gap-4 rounded-3xl border border-slate-100 bg-white/95 px-9 py-7 shadow-2xl shadow-slate-900/15 backdrop-blur-xl animate-in zoom-in-95 duration-200 dark:border-slate-800 dark:bg-slate-900/95 max-w-[85vw] text-center">
        <div className="relative flex size-12 items-center justify-center">
          {/* Subtle background ring */}
          <div className="absolute inset-0 rounded-full border-[3px] border-emerald-600/20" />
          {/* Animated spinner ring */}
          <div className="absolute inset-0 animate-[spin_0.8s_linear_infinite] rounded-full border-[3px] border-emerald-600 border-t-transparent" />
          {/* Inner pulsating dot */}
          <div className="size-2.5 animate-pulse rounded-full bg-emerald-600" />
        </div>
        {message && (
          <p className="text-sm font-semibold tracking-wide text-slate-800 dark:text-slate-100 animate-pulse">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
