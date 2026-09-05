"use client";

import { useState } from "react";
import { useDonations } from "@/hooks/use-donations";
import { useFunds } from "@/hooks/use-funds";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import Link from "next/link";

export default function TransactionsPage() {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [fundFilter, setFundFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All");
  const [campaignFilter, setCampaignFilter] = useState("All");

  const { data: donationsData, isLoading: isLoadingDonations } = useDonations({ search, limit: 100 });
  const { data: fundsData, isLoading: isLoadingFunds } = useFunds({ limit: 50 });

  // Client-side filtering logic
  const filteredDonations = donationsData?.data?.filter((donation: any) => {
    // Fund Filter
    if (fundFilter !== "All" && donation.fundId !== fundFilter) return false;
    
    // Mocking Source & Campaign extraction (This will come from DB in next phase)
    const mockSource = "Web";
    const mockCampaign = "Organic";
    
    if (sourceFilter !== "All" && mockSource !== sourceFilter) return false;
    if (campaignFilter !== "All" && mockCampaign !== campaignFilter) return false;

    // Date Filter
    if (dateRange?.from) {
      const dDate = new Date(donation.wcDateCreated);
      if (dDate < dateRange.from) return false;
      if (dateRange.to && dDate > dateRange.to) return false;
    }

    return true;
  }) || [];

  return (
    <div className="flex flex-col gap-6 pb-10">


      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-4 flex flex-col gap-4">
          <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold text-foreground shrink-0">Donation History</CardTitle>
            
            {/* Filters Row */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search donor..."
                  className="pl-9 bg-muted/50 border-none rounded-xl h-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>

              <Select value={fundFilter} onValueChange={(val) => setFundFilter(val || "All")} disabled={isLoadingFunds}>
                <SelectTrigger className="w-full sm:w-[160px] bg-muted/50 border-none rounded-xl h-9">
                  <SelectValue placeholder="All Funds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Funds</SelectItem>
                  {fundsData?.data?.map((fund: any) => (
                    <SelectItem key={fund.id} value={fund.id}>{fund.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={sourceFilter} onValueChange={(val) => setSourceFilter(val || "All")}>
                <SelectTrigger className="w-full sm:w-[140px] bg-muted/50 border-none rounded-xl h-9">
                  <SelectValue placeholder="All Sources" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Sources</SelectItem>
                  <SelectItem value="Web">Web</SelectItem>
                  <SelectItem value="Manual">Manual</SelectItem>
                  <SelectItem value="API">API</SelectItem>
                </SelectContent>
              </Select>

              <Select value={campaignFilter} onValueChange={(val) => setCampaignFilter(val || "All")}>
                <SelectTrigger className="w-full sm:w-[140px] bg-muted/50 border-none rounded-xl h-9">
                  <SelectValue placeholder="All Campaigns" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Campaigns</SelectItem>
                  <SelectItem value="Organic">Organic</SelectItem>
                  <SelectItem value="Facebook_Ads">Facebook Ads</SelectItem>
                  <SelectItem value="Email_Newsletter">Email Newsletter</SelectItem>
                </SelectContent>
              </Select>

              <DateRangePicker 
                date={dateRange} 
                setDate={setDateRange} 
                className="w-full sm:w-auto"
              />
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Date</TableHead>
                  <TableHead className="font-semibold text-foreground">Donor</TableHead>
                  <TableHead className="font-semibold text-foreground">Fund</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Amount</TableHead>
                  <TableHead className="font-semibold text-foreground">Source</TableHead>
                  <TableHead className="font-semibold text-foreground">Campaign</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoadingDonations ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[60px] mx-auto rounded-full" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredDonations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                      No transactions found matching the selected filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDonations.map((donation: any) => (
                    <TableRow key={donation.id} className="hover:bg-muted/50 transition-colors">
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {donation.wcDateCreated ? format(new Date(donation.wcDateCreated), "MMM dd, yyyy") : "N/A"}
                      </TableCell>
                      <TableCell>
                        <Link href={`/dashboard/donors/${donation.donorId}`} className="font-medium text-primary hover:underline">
                          {donation.donor ? `${donation.donor.firstName || ""} ${donation.donor.lastName || ""}`.trim() : "Anonymous"}
                        </Link>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {donation.fund?.name ? (
                          <Link href={`/dashboard/funds/${donation.fundId}`} className="hover:underline">
                            {donation.fund.name}
                          </Link>
                        ) : "General Fund"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-foreground">
                        ৳{Number(donation.amount || 0).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="bg-slate-50 text-slate-600 border-slate-200 capitalize">
                          {donation.utmSource || "Direct"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {(donation.utmCampaign && donation.utmCampaign !== "unknown") ? donation.utmCampaign : "Organic"}
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
        </CardContent>
      </Card>
    </div>
  );
}
