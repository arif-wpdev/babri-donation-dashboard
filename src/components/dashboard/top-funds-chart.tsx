"use client";

import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#0D472B", "#00B74A", "#33D45E", "#051C10"];

export function TopFundsChart() {
  const { data, isLoading } = useDashboardStats();

  if (isLoading || !data) {
    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm h-full w-full flex flex-col gap-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="flex-1 w-full rounded-xl" />
      </div>
    );
  }

  // Calculate percentages
  const fundsData = data.topFunds.filter(f => f.value > 0).slice(0, 4);
  const maxSales = Math.max(...fundsData.map(f => f.value), 1); // Avoid division by zero

  if (fundsData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-3xl shadow-sm h-full w-full flex flex-col items-center justify-center text-muted-foreground">
        No funds data available.
      </div>
    );
  }

  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm h-full w-full flex flex-col">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="font-bold text-lg text-foreground">Top Funds</h3>
          <p className="text-sm text-muted-foreground mt-1">Track top performing funds</p>
        </div>
      </div>
      
      <div className="flex-1 flex flex-col sm:flex-row items-center justify-between gap-8 pt-0">
        
        {/* Left Side: Overlapping Circles */}
        <div className="relative w-40 h-40 shrink-0 mx-auto sm:mx-0">
          {fundsData[0] && (
            <div className="absolute left-0 bottom-4 size-24 rounded-full bg-[#0D472B] flex items-center justify-center text-white font-bold text-xl shadow-lg z-20">
              {((fundsData[0].value / maxSales) * 100).toFixed(0)}%
            </div>
          )}
          {fundsData[1] && (
            <div className="absolute right-0 bottom-8 size-20 rounded-full bg-[#00B74A] flex items-center justify-center text-white font-bold text-lg shadow-lg z-10 mix-blend-multiply opacity-90">
              {((fundsData[1].value / maxSales) * 100).toFixed(0)}%
            </div>
          )}
          {fundsData[2] && (
            <div className="absolute left-4 top-2 size-14 rounded-full bg-[#33D45E] flex items-center justify-center text-[#0D472B] font-bold text-sm shadow-md z-0">
              {((fundsData[2].value / maxSales) * 100).toFixed(0)}%
            </div>
          )}
          {fundsData[3] && (
            <div className="absolute right-4 top-0 size-10 rounded-full bg-[#E6EFEA] flex items-center justify-center text-[#0D472B] font-bold text-xs shadow-sm z-0">
              {((fundsData[3].value / maxSales) * 100).toFixed(0)}%
            </div>
          )}
        </div>

        {/* Right Side: List of Funds with Progress Bars */}
        <div className="flex flex-col gap-4 w-full">
          {fundsData.map((fund, index) => (
            <div key={index} className="flex items-center gap-3">
              <span className="text-sm font-bold text-muted-foreground w-4">#{index + 1}</span>
              <div className="flex flex-col gap-1.5 w-full">
                <div className="flex justify-between items-center w-full">
                  <span className="text-xs font-semibold text-foreground truncate max-w-[120px]" title={fund.name}>{fund.name}</span>
                  <span className="text-xs text-muted-foreground">৳{fund.value.toLocaleString()}</span>
                </div>
                <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-1000 ease-out" 
                    style={{ 
                      width: `${(fund.value / maxSales) * 100}%`,
                      backgroundColor: COLORS[index] || COLORS[0]
                    }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
