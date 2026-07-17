import { useQuery } from "@tanstack/react-query";

interface DonorsParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string;
  minAmount?: number | "";
  maxAmount?: number | "";
  minCount?: number | "";
  maxCount?: number | "";
  sortBy?: "lastDonation" | "totalSpent" | "ordersCount";
  sortOrder?: "asc" | "desc";
  fundId?: string | "all";
}

async function fetchDonors(params: DonorsParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.orgId) query.set("orgId", params.orgId);
  if (params.minAmount !== undefined && params.minAmount !== "") query.set("minAmount", String(params.minAmount));
  if (params.maxAmount !== undefined && params.maxAmount !== "") query.set("maxAmount", String(params.maxAmount));
  if (params.minCount !== undefined && params.minCount !== "") query.set("minCount", String(params.minCount));
  if (params.maxCount !== undefined && params.maxCount !== "") query.set("maxCount", String(params.maxCount));
  if (params.sortBy) query.set("sortBy", params.sortBy);
  if (params.sortOrder) query.set("sortOrder", params.sortOrder);
  if (params.fundId && params.fundId !== "all") query.set("fundId", params.fundId);

  const res = await fetch(`/api/donors?${query.toString()}`);
  if (!res.ok) throw new Error("Failed to fetch donors");
  return res.json();
}

export function useDonors(params: DonorsParams = {}) {
  return useQuery({
    queryKey: ["donors", params],
    queryFn: () => fetchDonors(params),
  });
}

async function fetchDonorById(donorId: string) {
  const res = await fetch(`/api/donors/${donorId}`);
  if (!res.ok) throw new Error("Failed to fetch donor");
  return res.json();
}

export function useDonor(donorId: string) {
  return useQuery({
    queryKey: ["donors", donorId],
    queryFn: () => fetchDonorById(donorId),
    enabled: !!donorId,
  });
}
