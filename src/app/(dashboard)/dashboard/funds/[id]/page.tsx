"use client";

import { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { useFunds } from "@/hooks/use-funds";
import { useDonations } from "@/hooks/use-donations";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { FundTransactionsTable } from "@/components/reporting/fund-transactions-table";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Users, CreditCard, TrendingUp, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { subDays, startOfMonth, startOfYear } from "date-fns";

export type FilterPreset = "all" | "today" | "yesterday" | "last7" | "last30" | "thisMonth" | "thisYear" | "custom";

export default function FundDetailsPage() {
  const params = useParams();
  const fundId = params.id as string;
  
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

  const source = "All"; // Kept for compatibility with the table component

  // Fetch all funds to find the current one (or we could fetch a single fund if API supported it)
  const { data: fundsData, isLoading: isLoadingFunds } = useFunds({ limit: 100 });
  const fund = fundsData?.data.find((f: any) => f.id === fundId);

  // Fetch donations summary to calculate KPIs for this specific fund
  const { data: donationsData, isLoading: isLoadingDonations } = useDonations({ 
    limit: 1, 
    fundId,
    from: dateRange?.from?.toISOString(),
    to: dateRange?.to?.toISOString(),
  });

  // Calculate KPIs using the backend summary to avoid pagination limits
  const totalRaised = donationsData?.summary?.totalAmount || 0;
  const totalDonations = donationsData?.summary?.totalDonations || 0;
  const uniqueDonors = donationsData?.summary?.uniqueDonors || 0;

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
      <div className="flex flex-col gap-4">
        <Link 
          href="/dashboard/funds" 
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeft className="size-4" />
          Back to Funds
        </Link>
        
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            {isLoadingFunds ? (
              <Skeleton className="h-8 w-[300px] mb-2" />
            ) : (
              <h2 className="text-3xl font-bold tracking-tight text-foreground">
                {fund?.name || "Fund Details"}
              </h2>
            )}
            <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
              <span>Fund Reporting & Analytics</span>
              {fund && (
                <>
                  <span>•</span>
                  <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded-md">WC ID: {fund.wcProductId}</span>
                </>
              )}
            </p>
          </div>
          
          <div className="flex items-center justify-start overflow-x-auto gap-2 bg-white p-2 rounded-xl border border-border shadow-sm">
            <DateRangePicker 
              date={customRange} 
              setDate={(range) => {
                setCustomRange(range);
                if (range) setFilter("custom");
              }}
              trigger={
                <Button variant="ghost" size="icon" className={cn("size-9 rounded-md shrink-0", filter === 'custom' && "bg-muted")}>
                  <CalendarIcon className="size-4 text-muted-foreground" />
                </Button>
              }
            />
            
            <div className="flex gap-1 shrink-0">
              {tabs.map((tab) => (
                <Button
                  key={tab.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilter(tab.value)}
                  className={cn(
                    "rounded-md text-sm font-medium transition-colors h-8 px-3",
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
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
        <Card className="border-none shadow-sm rounded-2xl bg-gradient-to-br from-[#0D472B] to-[#0a3822] text-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-white/80">Total Raised</span>
                <span className="text-3xl font-bold">
                  {isLoadingDonations ? <Skeleton className="h-8 w-24 bg-white/20" /> : `৳${Number(totalRaised).toLocaleString()}`}
                </span>
              </div>
              <div className="size-10 rounded-full bg-white/10 flex items-center justify-center">
                <TrendingUp className="size-5 text-white" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Total Donors</span>
                <span className="text-3xl font-bold text-foreground">
                  {isLoadingDonations ? <Skeleton className="h-8 w-16" /> : uniqueDonors.toLocaleString()}
                </span>
              </div>
              <div className="size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center">
                <Users className="size-5 text-[#0D472B]" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardContent className="p-6">
            <div className="flex justify-between items-start">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-medium text-muted-foreground">Total Donations</span>
                <span className="text-3xl font-bold text-foreground">
                  {isLoadingDonations ? <Skeleton className="h-8 w-16" /> : totalDonations.toLocaleString()}
                </span>
              </div>
              <div className="size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center">
                <CreditCard className="size-5 text-[#0D472B]" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table Section */}
      <div className="flex flex-col gap-4">
        <h3 className="text-xl font-bold text-foreground">Transaction History</h3>
        <FundTransactionsTable 
          fundId={fundId} 
          dateRange={dateRange || undefined} 
          source={source} 
        />
      </div>
    </div>
  );
}
