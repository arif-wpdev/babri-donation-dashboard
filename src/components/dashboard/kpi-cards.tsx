"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DollarSign, Calendar, TrendingUp, Users, RefreshCw, Award } from "lucide-react";
import { formatNumber } from "@/lib/utils";
import type { DashboardStats } from "@/hooks/use-dashboard-stats";

interface KpiCardsProps {
  data?: DashboardStats["kpis"];
  isLoading: boolean;
}

export function KpiCards({ data, isLoading }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {/* TOTAL DONATIONS */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <DollarSign className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Donations</span>
            <span className="text-lg md:text-xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-7 w-24" /> : formatNumber(data?.totalRaised || 0, true)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* TODAY'S DONATION */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Calendar className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Today's Donation</span>
            <span className="text-lg md:text-xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-7 w-24" /> : formatNumber(data?.todayRaised || 0, true)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* THIS MONTH */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <TrendingUp className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">This Month</span>
            <span className="text-lg md:text-xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-7 w-24" /> : formatNumber(data?.thisMonthRaised || 0, true)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* TOTAL DONORS */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Users className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Total Donors</span>
            <span className="text-lg md:text-xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-7 w-16" /> : formatNumber(data?.totalDonors || 0, false)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* REPEAT DONORS */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <RefreshCw className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Repeat Donors</span>
            <span className="text-lg md:text-xl font-bold text-foreground">
              {isLoading ? <Skeleton className="h-7 w-16" /> : formatNumber(data?.repeatDonors || 0, false)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* AVERAGE & MAX */}
      <Card className="border-none shadow-sm rounded-lg">
        <CardContent className="p-3 md:p-4 flex items-center gap-3 md:gap-4">
          <div className="size-10 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <Award className="size-5" />
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Average & Max</span>
            <div className="text-xs font-bold text-foreground leading-tight mt-1">
              {isLoading ? (
                <Skeleton className="h-7 w-24" />
              ) : (
                <>
                  Avg: {formatNumber(data?.averageDonation || 0, true)} | <br className="hidden xl:block" />
                  Max: {formatNumber(data?.maxDonation || 0, true)}
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
