"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useFunds } from "@/hooks/use-funds";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CalendarIcon } from "lucide-react";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { formatNumber, cn } from "@/lib/utils";
import { DateRange } from "react-day-picker";
import { subDays, startOfMonth, startOfYear } from "date-fns";

export type FilterPreset = "all" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "thisYear" | "custom";

export default function FundsOverviewPage() {
  const [filter, setFilter] = useState<FilterPreset>("today");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

  const dateRange = useMemo<DateRange | null>(() => {
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    
    switch (filter) {
      case "today": {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        return { from: start, to: today };
      }
      case "yesterday": {
        const start = subDays(new Date(), 1);
        start.setHours(0, 0, 0, 0);
        const end = subDays(new Date(), 1);
        end.setHours(23, 59, 59, 999);
        return { from: start, to: end };
      }
      case "last7":
        return { from: subDays(today, 6), to: today };
      case "last30":
        return { from: subDays(today, 29), to: today };
      case "thisMonth":
        return { from: startOfMonth(today), to: today };
      case "thisYear":
        return { from: startOfYear(today), to: today };
      case "custom":
        return customRange || null;
      case "all":
      default:
        return null;
    }
  }, [filter, customRange]);

  const { data: fundsData, isLoading: isLoadingFunds } = useFunds({ limit: 50 });
  const { data: statsData, isLoading: isLoadingStats } = useDashboardStats(dateRange);

  const isLoading = isLoadingFunds || isLoadingStats;

  const tabs: { value: FilterPreset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last7", label: "This Week" },
    { value: "thisMonth", label: "This Month" },
    { value: "thisYear", label: "This Year" },
    { value: "all", label: "All Time" },
  ];

  return (
    <div className="flex flex-col gap-6 pb-10">


      <div className="flex items-center justify-start overflow-x-auto gap-4 bg-white p-3 rounded-xl border border-border shadow-sm">
        <DateRangePicker 
          date={customRange} 
          setDate={(range) => {
            setCustomRange(range);
            if (range) setFilter("custom");
          }}
          trigger={
            <Button variant="ghost" size="icon" className={cn("size-10 rounded-md shrink-0", filter === 'custom' && "bg-muted")}>
              <CalendarIcon className="size-5 text-muted-foreground" />
            </Button>
          }
        />
        
        <div className="flex gap-2 shrink-0">
          {tabs.map((tab) => (
            <Button
              key={tab.value}
              variant="ghost"
              size="sm"
              onClick={() => setFilter(tab.value)}
              className={cn(
                "rounded-md text-sm font-medium transition-colors h-9 px-4",
                filter === tab.value 
                  ? "bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary" 
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {tab.label}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 lg:gap-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white border border-border/50 rounded-2xl p-6 shadow-sm flex flex-col gap-4">
              <Skeleton className="h-6 w-3/4" />
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <Skeleton className="h-4 w-20 mb-2" />
                  <Skeleton className="h-8 w-24" />
                </div>
                <div>
                  <Skeleton className="h-4 w-16 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </div>
              </div>
            </div>
          ))
        ) : fundsData?.data.length === 0 ? (
          <div className="col-span-full bg-white border border-border/50 rounded-2xl p-12 text-center text-muted-foreground shadow-sm">
            No funds found. Have you synced with WooCommerce?
          </div>
        ) : (
          fundsData?.data.map((fund: any) => {
            const stats = statsData?.fundBreakdown.find((f: any) => f.fundName === fund.name);
            const amountRaised = stats?.amountRaised || 0;
            const donorsCount = stats?.donorsCount || 0;

            return (
              <Link href={`/dashboard/funds/${fund.id}`} key={fund.id} className="block group h-full">
                <div className="bg-white border border-border/60 rounded-2xl p-6 hover:border-primary/40 hover:shadow-md hover:shadow-primary/5 transition-all duration-300 h-full flex flex-col justify-between">
                  <div>
                    <h3 className="font-semibold text-lg text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {fund.name}
                    </h3>
                  </div>
                  <div className="mt-6 grid grid-cols-2 gap-4 items-end">
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Amount Raised</p>
                      <p className="font-bold text-primary text-xl tracking-tight">
                        {formatNumber(amountRaised, true, false)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-1">Donors</p>
                      <p className="font-semibold text-foreground text-xl tracking-tight">
                        {formatNumber(donorsCount, false, false)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
