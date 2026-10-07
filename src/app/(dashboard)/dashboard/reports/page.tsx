"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, PieChart, Pie, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";
import { AdSpendReport } from "@/components/reporting/ad-spend-report";
import { useDashboardStats } from "@/hooks/use-dashboard-stats";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle } from "lucide-react";

const COLORS = ["#0D472B", "#00B74A", "#33D45E", "#051C10", "#E6EFEA"];

function formatTaka(value: number) {
  return `৳${value.toLocaleString("en-BD", { maximumFractionDigits: 2 })}`;
}

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const { data, isLoading, isError } = useDashboardStats(dateRange, true);
  const sourceData = data?.sourceReport ?? [];
  const campaignData = data?.campaignReport ?? [];
  const pieData = campaignData.filter((campaign) => campaign.volume > 0);

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">

        
        <DateRangePicker 
          date={dateRange} 
          setDate={setDateRange} 
          className="w-full sm:w-auto"
        />
      </div>

      <AdSpendReport dateRange={dateRange} />

      <div role="note" className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <p>Source and campaign totals are based on UTM values saved on completed donations. Donations without UTM tags are grouped as Direct / Unattributed; results do not represent ad spend.</p>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Source Performance Chart */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Revenue by Source</CardTitle>
            <CardDescription>Completed donation volume grouped by stored UTM source. Direct/unattributed is shown separately.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              {isLoading ? <Skeleton className="h-full w-full" /> : isError ? (
                <div role="alert" className="flex h-full items-center justify-center text-sm text-destructive">Could not load donation source report.</div>
              ) : sourceData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">No completed donations in this period.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={sourceData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                    <XAxis dataKey="source" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: "#6B7280" }} tickFormatter={(value) => `৳${Number(value).toLocaleString("en-BD")}`} />
                    <RechartsTooltip cursor={{ fill: "#F3F4F6" }} formatter={(value) => [formatTaka(Number(value)), "Donation volume"]} contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontWeight: 500 }} />
                    <Bar dataKey="volume" name="Donation volume" radius={[6, 6, 0, 0]} barSize={40}>
                      {sourceData.map((entry, index) => <Cell key={entry.source} fill={COLORS[index % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Campaign Performance Pie */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Campaign Distribution</CardTitle>
            <CardDescription>Completed donation volume grouped by stored UTM campaign. Missing or unknown campaigns are unattributed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between">
            {isLoading ? <Skeleton className="h-[260px] w-[260px] rounded-full" /> : isError ? (
              <div role="alert" className="flex h-[260px] flex-1 items-center justify-center text-sm text-destructive">Could not load campaign report.</div>
            ) : pieData.length === 0 ? (
              <div className="flex h-[260px] flex-1 items-center justify-center text-sm text-muted-foreground">No attributed completed donations in this period.</div>
            ) : <>
            <div className="h-[260px] w-[260px] shrink-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="volume"
                    stroke="none"
                  >
                    {pieData.map((entry, index) => (
                      <Cell key={`${entry.source}-${entry.campaign}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontWeight: 500 }}
                    formatter={(value) => [formatTaka(Number(value)), "Donation volume"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex flex-col gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              {pieData.map((item, index) => (
                <div key={`${item.source}-${item.campaign}`} className="flex items-center justify-between gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                    <span className="font-medium text-foreground">{item.campaign} <span className="text-muted-foreground">· {item.source}</span></span>
                  </div>
                  <span className="font-semibold text-foreground">{formatTaka(item.volume)}</span>
                </div>
              ))}
            </div>
            </>}
          </CardContent>
        </Card>
      </div>

      {/* Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Source Table */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Source Report</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Source</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Donations</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={3}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  : sourceData.map((item) => (
                  <TableRow key={item.source}>
                    <TableCell className="font-medium">
                      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                        {item.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{item.donations.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatTaka(item.volume)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && sourceData.length === 0 && <TableRow><TableCell colSpan={3} className="h-20 text-center text-muted-foreground">No donation source data for this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Campaign Table */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Campaign Report</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Campaign</TableHead>
                  <TableHead className="font-semibold text-foreground">Source</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Donations</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? <TableRow><TableCell colSpan={4}><Skeleton className="h-8 w-full" /></TableCell></TableRow>
                  : campaignData.map((item) => (
                  <TableRow key={`${item.source}-${item.campaign}`}>
                    <TableCell className="font-medium">{item.campaign}</TableCell>
                    <TableCell><Badge variant="outline">{item.source}</Badge></TableCell>
                    <TableCell className="text-center">{item.donations.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{formatTaka(item.volume)}</TableCell>
                  </TableRow>
                ))}
                {!isLoading && campaignData.length === 0 && <TableRow><TableCell colSpan={4} className="h-20 text-center text-muted-foreground">No campaign attribution data for this period.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
