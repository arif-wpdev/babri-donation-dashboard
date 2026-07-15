"use client";

import { useState } from "react";
import Link from "next/link";
import { useFunds } from "@/hooks/use-funds";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export default function FundsOverviewPage() {
  const [search, setSearch] = useState("");
  // We hardcode orgId for now or rely on useFunds default if session injected via hook later.
  // Assuming useFunds hooks handles it internally if not provided, or we can just fetch all.
  const { data, isLoading } = useFunds({ search, limit: 50 });

  return (
    <div className="flex flex-col gap-6 pb-10">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-foreground">Funds Overview</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and analyze your active donation funds.
          </p>
        </div>
      </div>

      <Card className="border-none shadow-sm rounded-2xl bg-white">
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold text-foreground">All Funds</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search funds..."
                className="pl-9 bg-muted/50 border-none rounded-xl"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-xl border border-border/50 overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="font-semibold text-foreground">Fund Name</TableHead>
                  <TableHead className="font-semibold text-foreground">Category</TableHead>
                  <TableHead className="font-semibold text-foreground">Status</TableHead>
                  <TableHead className="font-semibold text-foreground">WC Product ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[200px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[80px] rounded-full" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                    </TableRow>
                  ))
                ) : data?.data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center h-32 text-muted-foreground">
                      No funds found. Have you synced with WooCommerce?
                    </TableCell>
                  </TableRow>
                ) : (
                  data?.data.map((fund) => (
                    <TableRow key={fund.id} className="cursor-pointer hover:bg-muted/50 transition-colors">
                      <TableCell>
                        <Link href={`/dashboard/funds/${fund.id}`} className="font-medium text-primary hover:underline">
                          {fund.name}
                        </Link>
                      </TableCell>
                      <TableCell>{fund.category || "Uncategorized"}</TableCell>
                      <TableCell>
                        <Badge 
                          variant="secondary"
                          className={fund.status === "PUBLISHED" ? "bg-green-100 text-green-700 hover:bg-green-100" : "bg-gray-100 text-gray-700"}
                        >
                          {fund.status.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        #{fund.wcProductId}
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
