import { useQuery, keepPreviousData } from "@tanstack/react-query";
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
  sourceReport: Array<{ source: string; donations: number; volume: number }>;
  campaignReport: Array<{ campaign: string; source: string; donations: number; volume: number }>;
}

export function useDashboardStats(dateRange?: DateRange | null, includeAttribution = false) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Dhaka";
  const dateKey = (date: Date | undefined) => date ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` : null;
  return useQuery<DashboardStats>({
    queryKey: ["dashboard-stats", dateKey(dateRange?.from), dateKey(dateRange?.to), timeZone, includeAttribution],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateRange?.from) params.append("from", dateRange.from.toISOString());
      if (dateRange?.to) params.append("to", dateRange.to.toISOString());
      params.append("tz", timeZone);
      if (includeAttribution) params.set("attribution", "1");

      const res = await fetch(`/api/dashboard/stats?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch dashboard stats");
      }
      return res.json();
    },
    refetchInterval: 5 * 60 * 1000, // 5 mins
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}
