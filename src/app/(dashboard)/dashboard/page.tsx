"use client";

import dynamic from "next/dynamic";
import { KpiCards } from "@/components/dashboard/kpi-cards";

const TrendChart = dynamic(() => import("@/components/dashboard/trend-chart").then((mod) => mod.TrendChart), { 
  ssr: false, 
  loading: () => <Skeleton className="h-full w-full rounded-2xl" /> 
});

const FundBreakdown = dynamic(() => import("@/components/dashboard/fund-breakdown").then((mod) => mod.FundBreakdown), { 
  ssr: false, 
  loading: () => <Skeleton className="h-[400px] w-full rounded-2xl" /> 
});

const RecentDonations = dynamic(() => import("@/components/dashboard/recent-donations").then((mod) => mod.RecentDonations), { 
  loading: () => <Skeleton className="h-[400px] w-full rounded-2xl" /> 
});
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { subDays, startOfMonth, startOfYear } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";

export type FilterPreset = "all" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "thisYear" | "custom";

export default function DashboardPage() {
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
      case "custom": {
        if (!customRange) return null;
        const from = customRange.from ? new Date(customRange.from) : undefined;
        let to = customRange.to ? new Date(customRange.to) : undefined;
        if (to) {
          to.setHours(23, 59, 59, 999);
        } else if (from) {
          // If only 'from' is selected, make 'to' the end of that single day
          to = new Date(from);
          to.setHours(23, 59, 59, 999);
        }
        return { from, to };
      }
      case "all":
      default:
        return null;
    }
  }, [filter, customRange]);

  const { data, isLoading } = useDashboardStats(dateRange);

  const periodLabel = useMemo(() => {
    switch (filter) {
      case "today": return "Today";
      case "yesterday": return "Yesterday";
      case "last7": return "Last 7 Days";
      case "last30": return "Last 30 Days";
      case "thisMonth": return "This Month";
      case "thisYear": return "This Year";
      case "custom": return "Custom Range";
      case "all": return "All Time";
      default: return "Overview";
    }
  }, [filter]);

  return (
    <div className="flex flex-col gap-4 lg:gap-6 pb-10">
      <KpiCards 
        data={data?.kpis} 
        isLoading={isLoading} 
        filter={filter}
        setFilter={setFilter}
        dateRange={dateRange}
        customRange={customRange}
        setCustomRange={setCustomRange}
      />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Left Column */}
        <div className="order-2 xl:order-1 xl:col-span-2 flex flex-col gap-4 lg:gap-6">
          <div className="h-[400px]">
            <TrendChart data={data?.trend} isLoading={isLoading} periodLabel={periodLabel} />
          </div>
          <RecentDonations />
        </div>
        
        {/* Right Column */}
        <div className="order-1 xl:order-2 xl:col-span-1 flex flex-col gap-4 lg:gap-6">
          <FundBreakdown data={data?.fundBreakdown} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
