import { useQuery } from "@tanstack/react-query";
import { DateRange } from "react-day-picker";

export interface DashboardStats {
  kpis: {
    totalRaised: number;
    todayRaised: number;
    thisMonthRaised: number;
    totalDonations: number;
    totalDonors: number;
    repeatDonors: number;
    averageDonation: number;
    maxDonation: number;
  };
  trend: Array<{ name: string; raised: number }>;
  fundBreakdown: Array<{ fundName: string; amountRaised: number; donorsCount: number }>;
}

export function useDashboardStats(dateRange?: DateRange | null) {
  return useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", dateRange?.from?.toISOString(), dateRange?.to?.toISOString()],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.append("from", dateRange.from.toISOString());
      if (dateRange?.to) params.append("to", dateRange.to.toISOString());

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5 mins
  });
}
