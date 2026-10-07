"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";

export interface AdSpendSummary {
  currency: "BDT";
  timeZone: "Asia/Dhaka";
  canManage: boolean;
  balance: number;
  totalTopUps: number;
  totalSpend: number;
  todaySpend: number;
  periodTopUps: number;
  periodSpend: number;
  period: { from: string | null; to: string | null };
  daily: Array<{ date: string; topUp: number; spend: number }>;
  entries: Array<{
    id: string;
    type: "TOP_UP" | "SPEND";
    status: "POSTED" | "VOID";
    source: "MANUAL" | "IMPORT";
    amount: number;
    currency: string;
    entryDate: string;
    campaignName: string | null;
    reference: string | null;
    note: string | null;
    createdAt: string;
    voidedAt: string | null;
    voidReason: string | null;
    createdBy: { name: string | null; email: string } | null;
  }>;
}

export interface AdLedgerInput {
  type: "TOP_UP" | "SPEND";
  amount: number;
  currency: "BDT";
  entryDate: string;
  campaignName?: string;
  reference?: string;
  note?: string;
}

function makeRangeQuery(range?: DateRange | null) {
  const query = new URLSearchParams();
  if (range?.from) query.set("from", formatLocalDate(range.from));
  if (range?.to) query.set("to", formatLocalDate(range.to));
  return query;
}

function formatLocalDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchSummary(range?: DateRange | null): Promise<AdSpendSummary> {
  const query = makeRangeQuery(range);
  const response = await fetch(`/api/ad-spend/summary${query.size ? `?${query}` : ""}`);
  if (!response.ok) throw new Error("Failed to load Facebook ad spend");
  return response.json();
}

export function useAdSpend(range?: DateRange | null, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["ad-spend-summary", range?.from?.toISOString() ?? null, range?.to?.toISOString() ?? null],
    queryFn: () => fetchSummary(range),
    enabled: options?.enabled ?? true,
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useAdLedgerActions() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["ad-spend-summary"] });

  const createEntry = useMutation({
    mutationFn: async (input: AdLedgerInput) => {
      const response = await fetch("/api/ad-spend/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save ledger entry");
      return result.data;
    },
    onSuccess: invalidate,
  });

  const voidEntry = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const response = await fetch(`/api/ad-spend/entries/${id}?reason=${encodeURIComponent(reason)}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not void ledger entry");
      return result;
    },
    onSuccess: invalidate,
  });

  const importFile = useMutation({
    mutationFn: async ({ file, confirm }: { file: File; confirm: boolean }) => {
      const form = new FormData();
      form.set("file", file);
      if (confirm) form.set("confirm", "true");
      const response = await fetch("/api/ad-spend/import", { method: "POST", body: form });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not import spend file");
      return result;
    },
    onSuccess: invalidate,
  });

  return { createEntry, voidEntry, importFile };
}
