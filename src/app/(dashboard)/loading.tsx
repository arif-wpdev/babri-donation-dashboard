export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Top summary row skeleton */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="flex flex-col justify-between rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-xs dark:border-slate-800 dark:bg-slate-900/60"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-20 rounded-md bg-slate-200 dark:bg-slate-800" />
              <div className="size-8 rounded-lg bg-emerald-100/60 dark:bg-emerald-950/40" />
            </div>
            <div className="mt-4 space-y-1.5">
              <div className="h-7 w-28 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="h-3 w-16 rounded-md bg-slate-100 dark:bg-slate-800/60" />
            </div>
          </div>
        ))}
      </div>

      {/* Main chart/content skeleton */}
      <div className="rounded-2xl border border-slate-200/80 bg-white/70 p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900/60">
        <div className="space-y-2 mb-6">
          <div className="h-5 w-40 rounded-md bg-slate-200 dark:bg-slate-800" />
          <div className="h-3 w-64 rounded-md bg-slate-100 dark:bg-slate-800/60" />
        </div>
        <div className="h-64 w-full rounded-xl bg-slate-100/70 dark:bg-slate-800/40" />
      </div>
    </div>
  );
}
