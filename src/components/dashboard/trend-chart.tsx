"use client";

import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { DashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";

interface TrendChartProps {
  data?: DashboardStats["trend"];
  isLoading: boolean;
  periodLabel?: string;
}

export function TrendChart({ data, isLoading, periodLabel = "Overview" }: TrendChartProps) {
  if (isLoading) {
    return (
      <div className="bg-white p-6 rounded-xl border border-border shadow-sm h-full w-full flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="flex-1 w-full rounded-lg" />
      </div>
    );
  }

  const chartData = data || [];
  const greenColor = "#006F46"; // New primary color

  return (
    <div className="bg-white p-6 rounded-xl border border-border shadow-sm h-full w-full flex flex-col gap-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xl font-semibold text-foreground">Donation Trends</h3>
        <div className="px-3 py-1 bg-muted/70 text-muted-foreground text-xs font-medium rounded-md">
          {periodLabel}
        </div>
      </div>
      
      <div className="flex-1 w-full relative">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 0, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={greenColor} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={greenColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#f1f5f9" />
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#6B7280', fontSize: 12 }}
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: '#6B7280', fontSize: 12 }}
              tickFormatter={(value) => formatNumber(value, true, true).toLowerCase()}
            />
            <Tooltip 
              contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              cursor={{ stroke: '#E5E7EB', strokeWidth: 2, strokeDasharray: '3 3' }}
              formatter={(value: any) => [formatNumber(Number(value), true, false), "Raised"]}
            />
            <Area 
              type="monotone" 
              dataKey="raised" 
              stroke={greenColor} 
              strokeWidth={2}
              fillOpacity={1} 
              fill="url(#colorSales)" 
              dot={{ r: 4, fill: "white", stroke: greenColor, strokeWidth: 2 }}
              activeDot={{ r: 6, fill: greenColor, stroke: "white", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
