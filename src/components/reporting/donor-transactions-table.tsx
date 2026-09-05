"use client";

import { useDonations } from "@/hooks/use-donations";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

interface DonorTransactionsTableProps {
  donorId: string;
}

export function DonorTransactionsTable({ donorId }: DonorTransactionsTableProps) {
  // Use donorId to fetch only this donor's donations
  const { data, isLoading } = useDonations({ donorId, limit: 100 });

  const filteredDonations = data?.data || [];

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold text-foreground">Date</TableHead>
            <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
            <TableHead className="font-semibold text-foreground">Fund</TableHead>
            <TableHead className="font-semibold text-foreground">Source</TableHead>
            <TableHead className="font-semibold text-foreground">Campaign</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
              </TableRow>
            ))
          ) : filteredDonations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                No transactions found for this donor.
              </TableCell>
            </TableRow>
          ) : (
            filteredDonations.map((donation: any) => (
              <TableRow key={donation.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {donation.wcDateCreated ? format(new Date(donation.wcDateCreated), "MMM dd, yyyy") : "N/A"}
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  ৳{Number(donation.total || 0).toLocaleString()}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {donation.fund?.name || "General Fund"}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 capitalize">
                    {donation.utmSource || "Direct"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {(donation.utmCampaign && donation.utmCampaign !== "unknown") ? "Paid" : "Organic"}
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
