"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import type { DashboardStats } from "@/hooks/use-dashboard-stats";

interface FundBreakdownProps {
  data?: DashboardStats["fundBreakdown"];
  isLoading: boolean;
}

export function FundBreakdown({ data, isLoading }: FundBreakdownProps) {
  return (
    <Card className="border-none shadow-sm rounded-lg h-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          At-a-Glance Fund Breakdown
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold text-xs">Campaign / Fund</TableHead>
                <TableHead className="text-right font-semibold text-xs">Amount Raised</TableHead>
                <TableHead className="text-right font-semibold text-xs w-24">Donors</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-[40px] ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data && data.length > 0 ? (
                data.map((fund) => (
                  <TableRow key={fund.fundName} className="hover:bg-muted/20">
                    <TableCell className="font-medium text-sm text-foreground/90 max-w-[200px] truncate" title={fund.fundName}>
                      {fund.fundName}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-blue-600 text-sm">
                      {formatNumber(fund.amountRaised, true)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground text-xs">
                      {formatNumber(fund.donorsCount, false)}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={3} className="h-24 text-center text-muted-foreground">
                    No data available for this period.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
