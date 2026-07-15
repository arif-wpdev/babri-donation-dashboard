import { useQuery } from "@tanstack/react-query";

interface DonorsParams {
  page?: number;
  limit?: number;
  search?: string;
  orgId?: string;
}

async function fetchDonors(params: DonorsParams) {
  const query = new URLSearchParams();
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));
  if (params.search) query.set("search", params.search);
  if (params.orgId) query.set("orgId", params.orgId);

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
