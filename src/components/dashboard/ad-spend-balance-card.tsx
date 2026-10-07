"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdSpend } from "@/hooks/use-ad-spend";

function taka(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export function AdSpendBalanceCard({ periodLabel }: { periodLabel: string }) {
  const { data, isLoading, isError } = useAdSpend(null);

  return (
    <Card className="overflow-hidden border border-emerald-900/10 bg-gradient-to-r from-[#063d29] via-[#075638] to-[#08734b] text-white shadow-sm">
      <CardContent className="grid grid-cols-1 gap-4 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15">
            <Wallet className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-100/80">Facebook Ads balance</div>
            {isLoading ? <Skeleton className="mt-2 h-8 w-36 bg-white/20" /> : isError ? (
              <p className="mt-2 text-sm text-rose-100">Balance unavailable</p>
            ) : (
              <div className="mt-1 truncate text-3xl font-bold tracking-tight sm:text-4xl">{taka(data?.balance ?? 0)}</div>
            )}
            <p className="mt-1 text-xs text-emerald-100/70">Current prepaid balance · BDT</p>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-white/15 pt-4 sm:min-w-64 sm:justify-end sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <div>
            <div className="text-xs text-emerald-100/75">Spend · {periodLabel}</div>
            {isLoading ? <Skeleton className="mt-2 h-6 w-28 bg-white/20" /> : (
              <div className="mt-1 flex items-center gap-1.5 text-xl font-semibold">
                <ArrowDownRight className="size-4 text-amber-200" aria-hidden="true" />
                {taka(data?.periodSpend ?? 0)}
              </div>
            )}
            {!isLoading && !isError && (
              <div className="mt-1 flex items-center gap-1 text-xs text-emerald-100/70">
                <ArrowUpRight className="size-3" aria-hidden="true" />
                Added {taka(data?.periodTopUps ?? 0)} in period
              </div>
            )}
          </div>
          <Link href="/dashboard/reports#facebook-ads" className="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm font-medium text-white ring-1 ring-white/20 transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
            Manage ads
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
