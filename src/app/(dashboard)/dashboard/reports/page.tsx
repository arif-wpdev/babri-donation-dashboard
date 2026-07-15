"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip as RechartsTooltip, PieChart, Pie, Cell } from "recharts";
import { Badge } from "@/components/ui/badge";

// Mock Data for MVP (Will be replaced with aggregated API data in next phase)
const sourceData = [
  { source: "Web", donations: 1245, volume: 854000, color: "#0D472B" },
  { source: "API", donations: 432, volume: 320500, color: "#00B74A" },
  { source: "Manual", donations: 89, volume: 45000, color: "#33D45E" },
];

const campaignData = [
  { campaign: "Organic Search", source: "Web", donations: 650, volume: 450000 },
  { campaign: "Facebook Ads", source: "Web", donations: 320, volume: 210000 },
  { campaign: "Email Newsletter", source: "Web", donations: 275, volume: 194000 },
  { campaign: "Partner App", source: "API", donations: 432, volume: 320500 },
  { campaign: "In-Person Event", source: "Manual", donations: 89, volume: 45000 },
];

const COLORS = ["#0D472B", "#00B74A", "#33D45E", "#051C10", "#E6EFEA"];

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">UTM Analytics</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Analyze donation sources and campaign performance.
          </p>
        </div>
        
        <DateRangePicker 
          date={dateRange} 
          setDate={setDateRange} 
          className="w-full sm:w-auto"
        />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
        {/* Source Performance Chart */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Revenue by Source</CardTitle>
            <CardDescription>Total volume of donations per acquisition source.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[300px] w-full mt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourceData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <XAxis 
                    dataKey="source" 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                    dy={10}
                  />
                  <YAxis 
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 12, fill: "#6B7280" }}
                    tickFormatter={(value) => `৳${value / 1000}k`}
                  />
                  <RechartsTooltip 
                    cursor={{ fill: "#F3F4F6" }}
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontWeight: 500 }}
                  />
                  <Bar 
                    dataKey="volume" 
                    radius={[6, 6, 0, 0]}
                    barSize={40}
                  >
                    {sourceData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Campaign Performance Pie */}
        <Card className="border-none shadow-sm rounded-2xl bg-white">
          <CardHeader>
            <CardTitle className="text-lg font-bold text-foreground">Campaign Distribution</CardTitle>
            <CardDescription>Donation volume split by marketing campaign.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col sm:flex-row items-center justify-between">
            <div className="h-[260px] w-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={campaignData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="volume"
                    stroke="none"
                  >
                    {campaignData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: "12px", border: "none", boxShadow: "0 4px 12px rgba(0,0,0,0.05)", fontWeight: 500 }}
                    formatter={(value: number) => [`৳${value.toLocaleString()}`, "Volume"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            
            <div className="flex flex-col gap-3 w-full sm:w-auto mt-4 sm:mt-0">
              {campaignData.map((item, index) => (
                <div key={index} className="flex items-center justify-between gap-6 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="size-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></span>
                    <span className="font-medium text-foreground">{item.campaign}</span>
                  </div>
                  <span className="font-semibold text-foreground">৳{item.volume.toLocaleString()}</span>
                </div>
              ))}
            </div>
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
                {sourceData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">
                      <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200">
                        {item.source}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">{item.donations.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-primary">৳{item.volume.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
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
                  <TableHead className="font-semibold text-foreground text-center">Donations</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Volume</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campaignData.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell className="font-medium">{item.campaign}</TableCell>
                    <TableCell className="text-center">{item.donations.toLocaleString()}</TableCell>
                    <TableCell className="text-right font-bold text-primary">৳{item.volume.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
