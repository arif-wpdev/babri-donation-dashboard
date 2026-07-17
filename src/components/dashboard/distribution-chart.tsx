"use client";

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";

const COLORS = ["#00B74A", "#0D472B", "#E32636", "#FFB300", "#3B82F6"];

export function DistributionChart() {
  const { data, isLoading } = useDashboardStats();

  if (isLoading || !data) {
    return (
      <div className="bg-[#E6EFEA] p-6 rounded-3xl h-full flex flex-col items-center justify-center">
        <Skeleton className="size-48 rounded-full" />
      </div>
    );
  }

  // Filter out funds with 0 raised for the pie chart
  const pieData = data.fundBreakdown.filter((f: any) => f.amountRaised > 0).map((f: any) => ({ name: f.fundName, value: f.amountRaised }));

  if (pieData.length === 0) {
    return (
      <div className="bg-[#E6EFEA] p-6 rounded-3xl h-full flex flex-col items-center justify-center text-muted-foreground">
        No donation distribution data yet.
      </div>
    );
  }

  return (
    <div className="bg-[#E6EFEA] p-6 rounded-3xl h-full flex flex-col relative overflow-hidden">
      <div className="flex-1 w-full relative min-h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={0}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              stroke="none"
            >
              {pieData.map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip 
              formatter={(value: any) => [`৳${Number(value).toLocaleString()}`, "Raised"]}
              contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      
      <div className="mt-4 flex flex-col gap-2 relative z-10">
        {pieData.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm font-semibold text-foreground truncate max-w-[120px]">{entry.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">৳{entry.value.toLocaleString()}</span>
              <span 
                className="text-xs font-medium text-white px-2 py-0.5 rounded-full"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              >
                {((entry.value / pieData.reduce((acc: number, curr: any) => acc + curr.value, 0)) * 100).toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
