import { useQuery } from "@tanstack/react-query";

interface FundsParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string; // Required for SUPER_ADMIN
}

async function fetchFunds(params: FundsParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.orgId) query.set("orgId", params.orgId);

  const res = await fetch(`/api/funds?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch funds");
  return res.json();
}

export function useFunds(params: FundsParams = {}) {
  return useQuery({
    queryKey: ["funds", params],
    queryFn: () => fetchFunds(params),
  });
}

async function fetchFundById(fundId: string) {
  const res = await fetch(`/api/funds/${fundId}`);
  if (!res.ok) throw new Error("Failed to fetch fund");
  return res.json();
}

export function useFund(fundId: string) {
  return useQuery({
    queryKey: ["funds", fundId],
    queryFn: () => fetchFundById(fundId),
    enabled: !!fundId,
  });
}
