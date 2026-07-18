"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarIcon } from "lucide-react";
import { formatNumber, cn } from "@/lib/utils";
import type { DashboardStats } from "@/hooks/use-dashboard-stats";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import type { FilterPreset } from "@/app/(dashboard)/dashboard/page";

interface KpiCardsProps {
  data?: DashboardStats["kpis"];
  isLoading: boolean;
  filter: FilterPreset;
  setFilter: (f: FilterPreset) => void;
  customRange: DateRange | undefined;
  setCustomRange: (range: DateRange | undefined) => void;
}

export function KpiCards({ data, isLoading, filter, setFilter, customRange, setCustomRange }: KpiCardsProps) {
  const tabs: { value: FilterPreset; label: string }[] = [
    { value: "today", label: "Today" },
    { value: "yesterday", label: "Yesterday" },
    { value: "last7", label: "This Week" },
    { value: "thisMonth", label: "This Month" },
    { value: "thisYear", label: "This Year" },
    { value: "all", label: "All Time" },
  ];

  const newDonors = Math.max(0, (data?.totalDonors || 0) - (data?.repeatDonors || 0));

  const getFilterLabel = () => {
    if (filter === "custom") {
      return customRange?.from ? "Custom" : "";
    }
    const tab = tabs.find(t => t.value === filter);
    return tab ? tab.label : "";
  };
  const filterLabel = getFilterLabel();

  return (
    <Card className="border shadow-sm rounded-xl bg-white overflow-hidden">
      <div className="border-b border-border p-3 flex items-center justify-start overflow-x-auto gap-4">
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
      
      <CardContent className="p-0 bg-border/50 gap-[1px] grid grid-cols-2 lg:grid-cols-4">
          {/* Total Donations */}
          <div className="pt-8 pb-5 px-5 lg:pt-10 lg:pb-8 lg:px-8 flex flex-col justify-center gap-1.5 bg-white relative">
             {filterLabel && (
               <div className="absolute top-2.5 left-5 lg:top-4 lg:left-8">
                 <span className="text-[9px] md:text-[10px] font-semibold text-primary bg-primary/10 px-1.5 py-0.5 rounded-md uppercase tracking-wider">{filterLabel}</span>
               </div>
             )}
             <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">Total Donations</span>
             <span className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
               {isLoading ? <Skeleton className="h-8 w-24" /> : formatNumber(data?.totalRaised || 0, true, false)}
             </span>
          </div>

          {/* Total Donors */}
          <div className="pt-8 pb-5 px-5 lg:pt-10 lg:pb-8 lg:px-8 flex flex-col justify-center gap-1.5 bg-white">
             <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">Total Donors</span>
             <span className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
               {isLoading ? <Skeleton className="h-8 w-16" /> : formatNumber(data?.totalDonors || 0, false, false)}
             </span>
          </div>

          {/* New Donors */}
          <div className="pt-8 pb-5 px-5 lg:pt-10 lg:pb-8 lg:px-8 flex flex-col justify-center gap-1.5 bg-white">
             <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">New Donors</span>
             <span className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
               {isLoading ? <Skeleton className="h-8 w-16" /> : formatNumber(newDonors, false, false)}
             </span>
          </div>

          {/* Average Donation */}
          <div className="pt-8 pb-5 px-5 lg:pt-10 lg:pb-8 lg:px-8 flex flex-col justify-center gap-1.5 bg-white">
             <span className="text-xs md:text-sm font-medium text-muted-foreground uppercase tracking-wider truncate">Avg Donation</span>
             <span className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground truncate">
               {isLoading ? <Skeleton className="h-8 w-20" /> : formatNumber(data?.averageDonation || 0, true, false)}
             </span>
          </div>
      </CardContent>
    </Card>
  );
}
