export default function AdminLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Title & subtitle skeleton */}
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-xl bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-96 max-w-full rounded-lg bg-slate-100 dark:bg-slate-800/60" />
      </div>

      {/* Grid of skeleton cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl bg-emerald-100/70 dark:bg-emerald-950/40" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-28 rounded-md bg-slate-200 dark:bg-slate-800" />
                <div className="h-3 w-40 rounded-md bg-slate-100 dark:bg-slate-800/60" />
              </div>
            </div>
            <div className="space-y-2 pt-2">
              <div className="h-3 w-full rounded-md bg-slate-100 dark:bg-slate-800/60" />
              <div className="h-3 w-3/4 rounded-md bg-slate-100 dark:bg-slate-800/60" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
