"use client";

import { useState } from "react";
import Link from "next/link";
import { useDonors } from "@/hooks/use-donors";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DonorsDirectoryPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  
  const { data, isLoading } = useDonors({ search, page, limit });

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Donor Directory</h2>
          <p className="text-sm text-muted-foreground mt-1">
            View and manage all donors synced from WooCommerce.
          </p>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-foreground">All Donors</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search donors..."
                className="pl-9 bg-muted/50 border-none rounded-xl"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1); // Reset page on search
                }}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Contact</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Total Donation</TableHead>
                  <TableHead className="font-semibold text-foreground text-center">Count</TableHead>
                  <TableHead className="font-semibold text-foreground">Latest Fund</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: limit }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[40px] mx-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.data?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-32 text-muted-foreground">
                      No donors found.
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data?.map((donor: any) => (
                    <TableRow key={donor.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Link href={`/dashboard/donors/${donor.id}`} className="flex items-center gap-3 group">
                          <div className="size-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs uppercase">
                            {donor.firstName?.[0] || donor.email?.[0] || "?"}
                          </div>
                          <span className="font-medium text-primary group-hover:underline">
                            {donor.firstName || donor.lastName ? `${donor.firstName || ""} ${donor.lastName || ""}`.trim() : (donor.email || donor.phone || donor.normalizedPhone || "Anonymous Donor")}
                          </span>
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{donor.email || "-"}</span>
                          <span className="text-xs text-muted-foreground">{donor.phone || donor.normalizedPhone || "-"}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground">
                        ৳{Number(donor.totalSpent || 0).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-center font-medium">
                        {donor.ordersCount || 0}
                      </TableCell>
                      <TableCell className="text-sm">
                        <div className="flex flex-col">
                          <span className="font-medium text-foreground">
                            {donor.donations?.[0]?.fund?.name || "General"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {donor.lastDonationAt ? format(new Date(donor.lastDonationAt), "MMM dd, yyyy") : (donor.wcDateModified ? format(new Date(donor.wcDateModified), "MMM dd, yyyy") : "-")}
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
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
