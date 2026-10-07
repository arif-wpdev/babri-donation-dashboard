import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/rbac";
import type { Role } from "@prisma/client";

export const AD_SPEND_TIME_ZONE = "Asia/Dhaka";
export const AD_SPEND_CURRENCY = "BDT";

export type AdSpendUser = {
  id: string;
  role: Role;
  orgId: string | null;
};

export async function resolveAdSpendOrgId(user: AdSpendUser, requestedOrgId?: string | null) {
  if (user.role !== "SUPER_ADMIN" && !user.orgId) {
    throw new ApiError("User is not associated with an organization", 403);
  }

  const orgId = user.role === "SUPER_ADMIN"
    ? requestedOrgId || user.orgId
    : user.orgId;

  if (!orgId) {
    throw new ApiError("Organization ID is required", 400);
  }

  const org = await prisma.organization.findFirst({
    where: { id: orgId, deletedAt: null },
    select: { id: true },
  });
  if (!org) throw new ApiError("Organization not found", 404);

  return org.id;
}

export function parseDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return null;
  return date;
}

export function nextDateOnly(date: Date) {
  return new Date(date.getTime() + 24 * 60 * 60 * 1000);
}

export function todayInDhaka(now = new Date()) {
  return dateOnlyInTimeZone(now, AD_SPEND_TIME_ZONE);
}

export function dateOnlyInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function ensureAdSpendWriter(role: Role) {
  if (role !== "SUPER_ADMIN" && role !== "ORG_ADMIN") {
    throw new ApiError("Only organization admins can manage ad ledger entries", 403);
  }
}
