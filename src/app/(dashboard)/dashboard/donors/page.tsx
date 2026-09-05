"use client";

import { useState } from "react";
import Link from "next/link";
import { useDonors } from "@/hooks/use-donors";
import { useFunds } from "@/hooks/use-funds";
import { format, formatDistanceToNow, differenceInHours } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight, Filter, X, Download } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { toast } from "sonner";

export default function DonorsDirectoryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [minAmount, setMinAmount] = useState<number | "">("");
  const [maxAmount, setMaxAmount] = useState<number | "">("");
  const [minCount, setMinCount] = useState<number | "">("");
  const [maxCount, setMaxCount] = useState<number | "">("");
  const [sortBy, setSortBy] = useState<"lastDonation" | "totalSpent" | "ordersCount">("lastDonation");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [fundId, setFundId] = useState<string | "all">("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  const { data: fundsData } = useFunds({ limit: 100 });
  
  const { data, isLoading } = useDonors({ search, page, limit, minAmount, maxAmount, minCount, maxCount, sortBy, sortOrder, fundId });

  const activeFilterCount = [minAmount, maxAmount, minCount, maxCount].filter(v => v !== "").length + (fundId !== "all" ? 1 : 0);

  const handleExport = async (exportFormat: "csv" | "excel" | "pdf") => {
    try {
      const toastId = toast.loading(`Preparing ${exportFormat.toUpperCase()} export...`);
      
      const params = new URLSearchParams();
      if (search) params.append("search", search);
      params.append("page", "1");
      params.append("limit", "10000"); // High limit for export
      if (minAmount !== "") params.append("minAmount", minAmount.toString());
      if (maxAmount !== "") params.append("maxAmount", maxAmount.toString());
      if (minCount !== "") params.append("minCount", minCount.toString());
      if (maxCount !== "") params.append("maxCount", maxCount.toString());
      if (fundId !== "all") params.append("fundId", fundId);
      params.append("sortBy", sortBy);
      params.append("sortOrder", sortOrder);
      
      const res = await fetch(`/api/donors?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch data for export");
      
      const { data: allDonors } = await res.json();
      
      if (!allDonors || allDonors.length === 0) {
        toast.error("No donors to export", { id: toastId });
        return;
      }

      const exportData = allDonors.map((donor: any) => {
        const dateStr = donor.donations?.[0]?.wcDatePaid || donor.lastDonationAt || donor.wcDateCreated;
        const formattedDate = dateStr ? format(new Date(dateStr), "MMM dd, yyyy") : "-";
        
        return {
          Name: donor.firstName || donor.lastName ? `${donor.firstName || ""} ${donor.lastName || ""}`.trim() : (donor.email || donor.phone || donor.normalizedPhone || "Anonymous"),
          Email: donor.email || "-",
          Phone: donor.phone || donor.normalizedPhone || "-",
          "Total Donation (Tk)": Number(donor.totalSpent || 0),
          "Donations": donor.ordersCount || 0,
          "Latest Fund": donor.donations?.[0]?.fund?.name || "General",
          "Last Donated": formattedDate,
          "Source": donor.donations?.[0]?.utmSource || "Direct",
          "Campaign": (donor.donations?.[0]?.utmCampaign && donor.donations[0].utmCampaign !== "unknown") ? "Paid" : "Organic"
        };
      });

      if (exportFormat === "csv") {
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = `Donors_Export_${format(new Date(), "yyyy-MM-dd")}.csv`;
        link.click();
      } 
      else if (exportFormat === "excel") {
        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Donors");
        XLSX.writeFile(workbook, `Donors_Export_${format(new Date(), "yyyy-MM-dd")}.xlsx`);
      }
      else if (exportFormat === "pdf") {
        const doc = new jsPDF("landscape", "pt", "a4");
        
        // Load Bengali/English combined font for PDF
        try {
          const fontUrl = "/fonts/HindSiliguri-Regular.ttf";
          const fontRes = await fetch(fontUrl);
          const fontBuffer = await fontRes.arrayBuffer();
          const fontUint8 = new Uint8Array(fontBuffer);
          let binary = '';
          for (let i = 0; i < fontUint8.byteLength; i++) {
            binary += String.fromCharCode(fontUint8[i]);
          }
          const base64Font = window.btoa(binary);
          
          doc.addFileToVFS("HindSiliguri.ttf", base64Font);
          doc.addFont("HindSiliguri.ttf", "HindSiliguri", "normal");
          doc.setFont("HindSiliguri");
        } catch (e) {
          console.error("Failed to load font", e);
        }

        doc.setFontSize(16);
        doc.setTextColor("#0a0a0a");
        doc.text("Donors Directory Report", 40, 40);
        doc.setFontSize(10);
        doc.text(`Generated on: ${format(new Date(), "MMM dd, yyyy HH:mm")}`, 40, 60);
        
        const headers = [Object.keys(exportData[0])];
        const rows = exportData.map((obj: any) => Object.values(obj));
        
        autoTable(doc, {
          head: headers,
          body: rows,
          startY: 80,
          styles: { 
            font: "HindSiliguri",
            fontSize: 8,
            textColor: "#0a0a0a" 
          },
          headStyles: { 
            fillColor: [13, 71, 43],
            textColor: "#ffffff"
          }, // Primary brand color
        });
        
        doc.save(`Donors_Export_${format(new Date(), "yyyy-MM-dd")}.pdf`);
      }
      
      toast.success(`${exportFormat.toUpperCase()} export downloaded successfully`, { id: toastId });
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export data");
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-10">


      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <CardTitle className="text-lg font-bold text-foreground flex items-center gap-2">
              All Donors
              {data?.meta?.total !== undefined && (
                <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-0.5 rounded-md whitespace-nowrap">
                  {data.meta.total} found
                </span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search donors..."
                  className="pl-9 bg-muted/50 border-none rounded-xl w-full"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant="outline" className="relative rounded-xl border-border/50 gap-2" />}>
                  <Download className="h-4 w-4" />
                  <span className="hidden sm:inline-block">Export</span>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40 rounded-xl">
                  <DropdownMenuItem onClick={() => handleExport("pdf")} className="cursor-pointer">
                    Download PDF (A4)
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("excel")} className="cursor-pointer">
                    Download Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleExport("csv")} className="cursor-pointer">
                    Download CSV
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
                <PopoverTrigger render={
                  <Button variant="outline" size="icon" className="relative rounded-xl border-border/50">
                    <Filter className="h-4 w-4 text-foreground" />
                    {activeFilterCount > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[10px] font-bold size-4 flex items-center justify-center rounded-full">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                } />
                <PopoverContent className="w-80 p-4 rounded-2xl" align="end">
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <h4 className="font-semibold text-sm text-foreground">Filter & Sort Donors</h4>
                      <p className="text-xs text-muted-foreground">Adjust filters to find specific donors.</p>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium">Min Amount (৳)</span>
                        <Input 
                          type="number" 
                          min="0"
                          placeholder="0" 
                          value={minAmount} 
                          onChange={(e) => { setMinAmount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} 
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium">Max Amount (৳)</span>
                        <Input 
                          type="number" 
                          min="0"
                          placeholder="∞" 
                          value={maxAmount} 
                          onChange={(e) => { setMaxAmount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} 
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium">Min Donations</span>
                        <Input 
                          type="number" 
                          min="0"
                          placeholder="0" 
                          value={minCount} 
                          onChange={(e) => { setMinCount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} 
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium">Max Donations</span>
                        <Input 
                          type="number" 
                          min="0"
                          placeholder="∞" 
                          value={maxCount} 
                          onChange={(e) => { setMaxCount(e.target.value ? Number(e.target.value) : ""); setPage(1); }} 
                        />
                      </div>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <span className="text-xs font-medium">Specific Fund</span>
                      <Select value={fundId} onValueChange={(val: any) => { setFundId(val); setPage(1); }}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="All Funds">
                            {fundId === "all" 
                              ? "All Funds" 
                              : fundsData?.data?.find((f: any) => f.id === fundId)?.name || fundId}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Funds</SelectItem>
                          {fundsData?.data?.map((fund: any) => (
                            <SelectItem key={fund.id} value={fund.id}>
                              {fund.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2 pt-2 border-t border-border">
                      <span className="text-xs font-medium">Sort By</span>
                      <div className="flex gap-2">
                        <Select value={sortBy} onValueChange={(val: any) => { setSortBy(val); setPage(1); }}>
                          <SelectTrigger className="flex-1">
                            <SelectValue>
                              {sortBy === "lastDonation" ? "Last Donation" : sortBy === "totalSpent" ? "Total Donated" : "Donation Count"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="lastDonation">Last Donation</SelectItem>
                            <SelectItem value="totalSpent">Total Donated</SelectItem>
                            <SelectItem value="ordersCount">Donation Count</SelectItem>
                          </SelectContent>
                        </Select>
                        <Select value={sortOrder} onValueChange={(val: any) => { setSortOrder(val); setPage(1); }}>
                          <SelectTrigger className="w-24">
                            <SelectValue>
                              {sortOrder === "desc" ? "Desc" : "Asc"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="desc">Desc</SelectItem>
                            <SelectItem value="asc">Asc</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2 mt-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1 text-xs h-8"
                        onClick={() => {
                          setMinAmount("");
                          setMaxAmount("");
                          setMinCount("");
                          setMaxCount("");
                          setSortBy("lastDonation");
                          setSortOrder("desc");
                          setFundId("all");
                          setPage(1);
                          setIsFilterOpen(false);
                        }}
                      >
                        Reset
                      </Button>
                      <Button 
                        variant="default" 
                        size="sm" 
                        className="flex-1 text-xs h-8 bg-[#0D472B] hover:bg-[#0a3822] text-white"
                        onClick={() => {
                          setIsFilterOpen(false);
                        }}
                      >
                        Apply Filters
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Name</TableHead>
                  <TableHead className="font-semibold text-foreground hidden md:table-cell">Contact</TableHead>
                  <TableHead className="font-semibold text-foreground text-right hidden md:table-cell">Total Donation</TableHead>
                  <TableHead className="font-semibold text-foreground text-center hidden md:table-cell">Count</TableHead>
                  <TableHead className="font-semibold text-foreground hidden md:table-cell">Latest Fund</TableHead>
                  <TableHead className="font-semibold text-foreground hidden md:table-cell">Source</TableHead>
                  <TableHead className="font-semibold text-foreground hidden md:table-cell">Campaign</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: limit }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[40px] mx-auto" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[80px]" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-[80px]" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center h-32 text-muted-foreground">
                      No donors found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data?.map((donor: any) => {
                    const dateStr = donor.donations?.[0]?.wcDatePaid || donor.lastDonationAt || donor.wcDateCreated;
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
                      <TableRow key={donor.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                        <TableCell className="align-top md:align-middle">
                          <div className="flex flex-col gap-0.5">
                            <div className="flex items-center gap-3 group">
                              <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase shrink-0">
                                {donor.firstName?.[0] || donor.email?.[0] || "?"}
                              </div>
                              <Link href={`/dashboard/donors/${donor.id}`} className="font-medium text-primary group-hover:underline truncate">
                                {donor.firstName || donor.lastName ? `${donor.firstName || ""} ${donor.lastName || ""}`.trim() : (donor.email || donor.phone || donor.normalizedPhone || "Anonymous Donor")}
                              </Link>
                            </div>
                            
                            {/* Mobile-only additional info */}
                            <div className="md:hidden flex flex-col text-[11px] text-muted-foreground ml-11 gap-0.5">
                              <div className="text-[13px] font-semibold text-foreground tracking-tight">
                                ৳{Number(donor.totalSpent || 0).toLocaleString()}
                              </div>
                              {(donor.phone || donor.normalizedPhone) && (
                                <span>{donor.phone || donor.normalizedPhone}</span>
                              )}
                              <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                <span className="font-medium text-foreground/80">{donor.donations?.[0]?.fund?.name || "General"}</span>
                                <span>•</span>
                                <span>{formattedDate}</span>
                              </div>
                              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">{donor.ordersCount || 0} Donations</span>
                                {donor.donations?.[0]?.utmSource && (
                                  <span className="bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">{donor.donations?.[0]?.utmSource || "Direct"}</span>
                                )}
                                <span className="bg-muted/80 text-muted-foreground px-1.5 py-0.5 rounded text-[10px]">{(donor.donations?.[0]?.utmCampaign && donor.donations[0].utmCampaign !== "unknown") ? "Paid" : "Organic"}</span>
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <div className="flex flex-col">
                            <span className="text-sm">{donor.email || "-"}</span>
                            <span className="text-xs text-muted-foreground">{donor.phone || donor.normalizedPhone || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold text-foreground align-top md:align-middle hidden md:table-cell">
                          ৳{Number(donor.totalSpent || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-center font-medium hidden md:table-cell">
                          {donor.ordersCount || 0}
                        </TableCell>
                        <TableCell className="text-sm hidden md:table-cell">
                          <div className="flex flex-col">
                            <span className="font-medium text-foreground">
                              {donor.donations?.[0]?.fund?.name || "General"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {formattedDate}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground hidden md:table-cell">
                          {donor.donations?.[0]?.utmSource || "Direct"}
                        </TableCell>
                        <TableCell className="text-muted-foreground hidden md:table-cell">
                          {(donor.donations?.[0]?.utmCampaign && donor.donations[0].utmCampaign !== "unknown") ? "Paid" : "Organic"}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          
          {/* Pagination Controls */}
          {data?.meta && data.meta.totalPages > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="hidden sm:inline-block">Rows per page</span>
                <Select
                  value={limit.toString()}
                  onValueChange={(val) => {
                    setLimit(Number(val));
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="w-[70px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="40">40</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-sm text-muted-foreground hidden sm:inline-block">
                  Page {data.meta.page} of {data.meta.totalPages}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={data.meta.page <= 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(p => Math.min(data.meta.totalPages, p + 1))}
                    disabled={data.meta.page >= data.meta.totalPages}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
