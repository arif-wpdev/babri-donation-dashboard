"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useFunds } from "@/hooks/use-funds";
import { useDonations } from "@/hooks/use-donations";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { FundTransactionsTable } from "@/components/reporting/fund-transactions-table";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Users, CreditCard, DollarSign } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";

export default function FundDetailsPage() {
  const params = useParams();
  const fundId = params.id as string;
  
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [source, setSource] = useState<string>("All");

  // Fetch all funds to find the current one (or we could fetch a single fund if API supported it)
  const { data: fundsData, isLoading: isLoadingFunds } = useFunds({ limit: 100 });
  const fund = fundsData?.data.find(f => f.id === fundId);

  // Fetch donations to calculate KPIs for this specific fund
  const { data: donationsData, isLoading: isLoadingDonations } = useDonations({ limit: 1000 });
  const fundDonations = donationsData?.data.filter(d => d.fundId === fundId) || [];

  // Calculate KPIs
  const totalRaised = fundDonations.reduce((sum, d) => sum + Number(d.amount), 0);
  const totalDonations = fundDonations.length;
  // Get unique donors
  const uniqueDonors = new Set(fundDonations.filter(d => d.donorId).map(d => d.donorId)).size;

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
          
          <div className="flex items-center gap-3">
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger className="w-[140px] bg-white border-border/50 rounded-xl">
                <SelectValue placeholder="Source" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="All">All Sources</SelectItem>
                <SelectItem value="Web">Website</SelectItem>
                <SelectItem value="Manual">Manual Entry</SelectItem>
              </SelectContent>
            </Select>

            <DateRangePicker 
              date={dateRange} 
              setDate={setDateRange} 
              className="rounded-xl border-border/50"
            />
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
                  {isLoadingDonations ? <Skeleton className="h-8 w-24 bg-white/20" /> : `৳${totalRaised.toLocaleString()}`}
                </span>
              </div>
              <div className="size-10 rounded-full bg-white/10 flex items-center justify-center">
                <DollarSign className="size-5 text-white" />
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
          dateRange={dateRange} 
          source={source} 
        />
      </div>
    </div>
  );
}
