import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type { DonationStatus } from "@prisma/client";

interface DonationsParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string;
  status?: DonationStatus;
  fundId?: string;
  donorId?: string;
  from?: string;
  to?: string;
}

async function fetchDonations(params: DonationsParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.orgId) query.set("orgId", params.orgId);
  if (params.status) query.set("status", params.status);
  if (params.fundId) query.set("fundId", params.fundId);
  if (params.donorId) query.set("donorId", params.donorId);
  if (params.from) query.set("from", params.from);
  if (params.to) query.set("to", params.to);

  const res = await fetch(`/api/donations?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch donations");
  return res.json();
}

export function useDonations(params: DonationsParams = {}) {
  return useQuery({
    queryKey: ["donations", params],
    queryFn: () => fetchDonations(params),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync trigger mutation
// ─────────────────────────────────────────────────────────────────────────────

async function triggerSync(orgId: string) {
  const res = await fetch(`/api/orgs/${orgId}/sync`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json();
    throw new Error(body.error ?? "Sync failed");
  }
  return res.json();
}

export function useTriggerSync(orgId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => triggerSync(orgId),
    onSuccess: () => {
      // Invalidate all data after a successful sync
      queryClient.invalidateQueries({ queryKey: ["funds"] });
      queryClient.invalidateQueries({ queryKey: ["donors"] });
      queryClient.invalidateQueries({ queryKey: ["donations"] });
    },
  });
}
