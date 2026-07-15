"use client";

import { KpiCards } from "@/components/dashboard/kpi-cards";
import { TrendChart } from "@/components/dashboard/trend-chart";
import { FundBreakdown } from "@/components/dashboard/fund-breakdown";
import { RecentDonations } from "@/components/dashboard/recent-donations";
import { useState, useMemo } from "react";
import { DateRange } from "react-day-picker";
import { subDays, startOfMonth, startOfYear } from "date-fns";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";

type FilterPreset = "all" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "thisYear" | "custom";

export default function DashboardPage() {
  const [filter, setFilter] = useState<FilterPreset>("last30");
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

  const { data, isLoading } = useDashboardStats(dateRange);

  return (
    <div className="flex flex-col gap-4 lg:gap-6 pb-10">
      <div className="flex justify-end items-center gap-2 mb-4">
        {filter === "custom" && (
          <DateRangePicker
            date={customRange}
            setDate={(range) => setCustomRange(range)}
            className="shadow-sm"
          />
        )}
        <Select value={filter} onValueChange={(val) => setFilter(val as FilterPreset)}>
          <SelectTrigger className="w-[180px] bg-white/80 backdrop-blur-md rounded-full shadow-sm border-border/60 hover:bg-white transition-colors">
            <SelectValue placeholder="Select period" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
              <SelectItem value="all">All Time</SelectItem>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="yesterday">Yesterday</SelectItem>
              <SelectItem value="last7">Last 7 Days</SelectItem>
              <SelectItem value="last30">Last 30 Days</SelectItem>
              <SelectItem value="thisMonth">This Month</SelectItem>
              <SelectItem value="thisYear">This Year</SelectItem>
              <SelectItem value="custom">Custom Range...</SelectItem>
            </SelectContent>
          </Select>
        </div>
      
      <KpiCards data={data?.kpis} isLoading={isLoading} />
      
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 lg:gap-6">
        {/* Left Column */}
        <div className="xl:col-span-2 flex flex-col gap-4 lg:gap-6">
          <div className="h-[400px]">
            <TrendChart data={data?.trend} isLoading={isLoading} />
          </div>
          <RecentDonations />
        </div>
        
        {/* Right Column */}
        <div className="xl:col-span-1 flex flex-col gap-4 lg:gap-6">
          <FundBreakdown data={data?.fundBreakdown} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
