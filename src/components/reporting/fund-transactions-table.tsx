"use client";

import { useDonations } from "@/hooks/use-donations";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
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
import Link from "next/link";

interface FundTransactionsTableProps {
  fundId: string;
  dateRange: DateRange | undefined;
  source: string;
}

export function FundTransactionsTable({ fundId, dateRange, source }: FundTransactionsTableProps) {
  const { data, isLoading } = useDonations({ limit: 50, fundId });

  // Client-side filtering as a fallback until API is updated to support specific fields
  const filteredDonations = data?.data.filter((donation: any) => {
    // 1. Filter by Source (simulating source via some metadata or assuming it's all "Web" for now)
    const mockSource = "Web"; // In a real scenario, this comes from wcOrder data
    const matchesSource = source === "All" || mockSource === source;

    // 2. Filter by Date Range
    let matchesDate = true;
    if (dateRange?.from) {
      const dDate = new Date(donation.wcDateCreated);
      if (dDate < dateRange.from) matchesDate = false;
      if (dateRange.to && dDate > dateRange.to) matchesDate = false;
    }

    return matchesSource && matchesDate;
  }) || [];

  return (
    <div className="rounded-xl border border-border/50 overflow-hidden bg-white">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-transparent">
            <TableHead className="font-semibold text-foreground">Name</TableHead>
            <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
            <TableHead className="font-semibold text-foreground">Fund</TableHead>
            <TableHead className="font-semibold text-foreground">Source</TableHead>
            <TableHead className="font-semibold text-foreground">Campaign</TableHead>
            <TableHead className="font-semibold text-foreground text-center">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
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
            filteredDonations.map((donation: any) => {
              const billing = donation.billingSnapshot || {};
              const firstName = donation.donor?.firstName || billing.first_name || billing.firstName || "";
              const lastName = donation.donor?.lastName || billing.last_name || billing.lastName || "";
              const email = donation.donor?.email || billing.email;
              
              const donorName = firstName || lastName 
                ? `${firstName} ${lastName}`.trim()
                : (email || "Anonymous");
                
              const dateStr = donation.wcDatePaid || donation.wcDateCreated;

              return (
                <TableRow key={donation.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <TableCell>
                    <div className="flex items-center gap-3 group">
                      <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                        {firstName?.[0] || email?.[0] || "?"}
                      </div>
                      <Link 
                        href={donation.donor?.id ? `/dashboard/donors/${donation.donor.id}` : "#"} 
                        className={`font-medium text-primary ${donation.donor?.id ? "group-hover:underline" : "cursor-default"}`}
                      >
                        {donorName}
                      </Link>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-semibold text-foreground">
                    ৳{Number(donation.total || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm">
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">
                        {donation.fund?.name || "General"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {(() => {
                          if (!dateStr) return "-";
                          const d = new Date(dateStr);
                          if (isNaN(d.getTime())) return "-";
                          return differenceInHours(new Date(), d) > 24 
                            ? format(d, "MMM dd, yyyy") 
                            : formatDistanceToNow(d, { addSuffix: true });
                        })()}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {donation.utmSource || "Direct"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {donation.utmCampaign ? "Paid" : "Organic"}
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
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );
}
