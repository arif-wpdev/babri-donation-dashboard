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
        "fixed inset-0 z-[9999] flex items-center justify-center bg-background/60 backdrop-blur-sm animate-in fade-in duration-300",
        className
      )}
    >
      <div className="flex flex-col items-center gap-5 rounded-3xl border border-white/10 bg-background/80 px-10 py-8 shadow-2xl backdrop-blur-xl animate-in zoom-in-95 duration-300">
        <div className="relative flex size-14 items-center justify-center">
          {/* Subtle background ring */}
          <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
          {/* Animated spinner ring */}
          <div className="absolute inset-0 animate-[spin_1s_ease-in-out_infinite] rounded-full border-4 border-primary border-t-transparent" />
          {/* Inner pulsating dot */}
          <div className="size-3 animate-pulse rounded-full bg-primary" />
        </div>
        {message && (
          <p className="animate-pulse text-sm font-semibold tracking-wide text-foreground">
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
