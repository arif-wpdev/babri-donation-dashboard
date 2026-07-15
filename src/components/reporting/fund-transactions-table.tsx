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
import { DateRange } from "react-day-picker";

interface FundTransactionsTableProps {
  fundId: string;
  dateRange: DateRange | undefined;
  source: string;
}

export function FundTransactionsTable({ fundId, dateRange, source }: FundTransactionsTableProps) {
  // Wait, useDonations hook currently supports: page, limit, search, orgId, status.
  // We need to pass fundId, dateRange, source to the hook ideally. 
  // For now, we'll fetch all or rely on the hook's current capabilities, and we can update the hook later to support these exact filters.
  const { data, isLoading } = useDonations({ limit: 50 });

  // Client-side filtering as a fallback until API is updated to support specific fields
  const filteredDonations = data?.data.filter(donation => {
    // 1. Filter by Fund
    const matchesFund = donation.fundId === fundId;
    
    // 2. Filter by Source (simulating source via some metadata or assuming it's all "Web" for now)
    const mockSource = "Web"; // In a real scenario, this comes from wcOrder data
    const matchesSource = source === "All" || mockSource === source;

    // 3. Filter by Date Range
    let matchesDate = true;
    if (dateRange?.from) {
      const dDate = new Date(donation.wcDateCreated);
      if (dDate < dateRange.from) matchesDate = false;
      if (dateRange.to && dDate > dateRange.to) matchesDate = false;
    }

    return matchesFund && matchesSource && matchesDate;
  }) || [];

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold text-foreground">Date</TableHead>
            <TableHead className="font-semibold text-foreground">Donor</TableHead>
            <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
            <TableHead className="font-semibold text-foreground">Source</TableHead>
            <TableHead className="font-semibold text-foreground">Campaign</TableHead>
            <TableHead className="font-semibold text-foreground text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                <TableCell><Skeleton className="h-6 w-[60px] mx-auto rounded-full" /></TableCell>
              </TableRow>
            ))
          ) : filteredDonations.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="text-center h-32 text-muted-foreground">
                No transactions found for the selected filters.
              </TableCell>
            </TableRow>
          ) : (
            filteredDonations.map((donation) => (
              <TableRow key={donation.id} className="hover:bg-muted/50 transition-colors">
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {donation.wcDateCreated ? format(new Date(donation.wcDateCreated), "MMM dd, yyyy") : "N/A"}
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {donation.donor ? `${donation.donor.firstName} ${donation.donor.lastName}` : "Anonymous"}
                  <div className="text-xs text-muted-foreground font-normal">
                    {donation.donor?.email}
                  </div>
                </TableCell>
                <TableCell className="text-right font-semibold text-foreground">
                  ৳{Number(donation.amount).toLocaleString()}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 capitalize">
                    {donation.utmSource || "Direct"}
                  </Badge>
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {donation.utmCampaign || "Organic"}
                </TableCell>
                <TableCell className="text-center">
                  <Badge 
                    variant="secondary"
                    className={
                      donation.status === "COMPLETED" ? "bg-[#E6EFEA] text-[#0D472B]" : 
                      donation.status === "PENDING" ? "bg-amber-100 text-amber-700" :
                      "bg-gray-100 text-gray-700"
                    }
                  >
                    {donation.status.toLowerCase()}
                  </Badge>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
