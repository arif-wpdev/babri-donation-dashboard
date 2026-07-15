"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { formatNumber } from "@/lib/utils";
import { useDonations } from "@/hooks/use-donations";
import { format } from "date-fns";

export function RecentDonations() {
  const { data, isLoading } = useDonations({
    page: 1,
    limit: 10,
  });

  return (
    <Card className="border-none shadow-sm rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wider">
          Recent Donations
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border border-border/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/30">
              <TableRow>
                <TableHead className="font-semibold text-xs">Date</TableHead>
                <TableHead className="font-semibold text-xs">Donor</TableHead>
                <TableHead className="font-semibold text-xs">Fund</TableHead>
                <TableHead className="text-right font-semibold text-xs">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell className="text-right"><Skeleton className="h-4 w-[60px] ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : data && data.data && data.data.length > 0 ? (
                data.data.map((donation: any) => {
                  const donorName = donation.donor?.firstName 
                    ? `${donation.donor.firstName} ${donation.donor.lastName || ""}`.trim()
                    : (donation.donor?.email || "Anonymous");
                  
                  return (
                    <TableRow key={donation.id} className="hover:bg-muted/20">
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {donation.wcDatePaid ? format(new Date(donation.wcDatePaid), "MMM d, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell className="font-medium text-sm text-foreground/90 max-w-[150px] truncate" title={donorName}>
                        {donorName}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate" title={donation.fund?.name || "General Fund"}>
                        {donation.fund?.name || "General Fund"}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-blue-600 text-sm whitespace-nowrap">
                        {formatNumber(Number(donation.total), true)}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={4} className="h-24 text-center text-muted-foreground">
                    No recent donations found.
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
