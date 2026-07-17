"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { useDonations } from "@/hooks/use-donations";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import Link from "next/link";

export function RecentDonations() {
  const { data, isLoading } = useDonations({
    page: 1,
    limit: 10,
  });

  return (
    <Card className="border-none shadow-sm rounded-2xl bg-white">
      <CardHeader className="pb-4 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-lg font-bold text-foreground">
          Recent Donations
        </CardTitle>
        <Link 
          href="/dashboard/donors" 
          className="text-xs font-medium text-primary hover:underline bg-primary/10 px-3 py-1.5 rounded-full transition-colors"
        >
          View All
        </Link>
      </CardHeader>
      <CardContent>
        <div className="rounded-xl border border-border/50 overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">Name</TableHead>
                <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
                <TableHead className="font-semibold text-foreground hidden md:table-cell">Fund</TableHead>
                <TableHead className="font-semibold text-foreground hidden md:table-cell">Source</TableHead>
                <TableHead className="font-semibold text-foreground hidden md:table-cell">Campaign</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[120px]" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[80px]" /></TableCell>
                    <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[80px]" /></TableCell>
                  </TableRow>
                ))
              ) : data?.data?.length > 0 ? (
                data.data.map((donation: any) => {
                  const billing = donation.billingSnapshot || {};
                  const firstName = donation.donor?.firstName || billing.first_name || billing.firstName || "";
                  const lastName = donation.donor?.lastName || billing.last_name || billing.lastName || "";
                  const email = donation.donor?.email || billing.email;
                  
                  const donorName = firstName || lastName 
                    ? `${firstName} ${lastName}`.trim()
                    : (email || "Anonymous");
                    
                  const dateStr = donation.wcDatePaid || donation.wcDateCreated;
                  
                  let formattedDate = "-";
                  if (dateStr) {
                    const d = new Date(dateStr);
                    if (!isNaN(d.getTime())) {
                      formattedDate = differenceInHours(new Date(), d) > 24 
                        ? format(d, "MMM dd, yyyy") 
                        : formatDistanceToNow(d, { addSuffix: true });
                    }
                  }
                  
                  return (
                    <TableRow key={donation.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell className="align-top md:align-middle">
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-3 group">
                            <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
                              {firstName?.[0] || email?.[0] || "?"}
                            </div>
                            <Link 
                              href={donation.donor?.id ? `/dashboard/donors/${donation.donor.id}` : "#"} 
                              className={`font-medium text-primary ${donation.donor?.id ? "group-hover:underline" : "cursor-default"}`}
                            >
                              {donorName}
                            </Link>
                          </div>
                          
                          {/* Mobile-only additional info */}
                          <div className="md:hidden flex flex-col text-[11px] text-muted-foreground ml-11 gap-0.5">
                            <span className="font-medium text-foreground">{donation.fund?.name || "General"}</span>
                            <span>{formattedDate}</span>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">{donation.utmSource || "Direct"}</span>
                              <span className="bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">{donation.utmCampaign ? "Paid" : "Organic"}</span>
                            </div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground align-top md:align-middle pt-4 md:pt-auto">
                        ৳{Number(donation.total || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-sm hidden md:table-cell">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {donation.fund?.name || "General"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formattedDate}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {donation.utmSource || "Direct"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                        {donation.utmCampaign ? "Paid" : "Organic"}
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
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
