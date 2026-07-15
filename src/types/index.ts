import type { Role, DonationStatus, SyncStatus, SyncTrigger } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// Re-export Prisma enum types
// ─────────────────────────────────────────────────────────────────────────────
export type { Role, DonationStatus, SyncStatus, SyncTrigger };

// ─────────────────────────────────────────────────────────────────────────────
// API Response wrapper types
// ─────────────────────────────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiError {
  error: string;
  issues?: Record<string, string[]>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain types (lightweight, for client consumption)
// ─────────────────────────────────────────────────────────────────────────────

export interface OrgSummary {
  id: string;
  name: string;
  slug: string;
  logoUrl: string | null;
  wcBaseUrl: string;
  syncEnabled: boolean;
  syncInterval: number;
  lastSyncedAt: string | null;
  createdAt: string;
  _count: {
    users: number;
    funds: number;
    donors: number;
    donations: number;
  };
}

export interface FundSummary {
  id: string;
  wcProductId: number;
  name: string;
  slug: string;
  status: string;
  price: number | null;
  totalSales: number;
  images: Array<{ id: number; src: string; alt: string }> | null;
  categories: Array<{ id: number; name: string; slug: string }> | null;
  syncedAt: string;
  _count: { donations: number };
}

export interface DonorSummary {
  id: string;
  wcCustomerId: number;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  totalSpent: number;
  ordersCount: number;
  isPayingCustomer: boolean;
  wcDateCreated: string | null;
  syncedAt: string;
  _count: { donations: number };
}

export interface DonationSummary {
  id: string;
  wcOrderId: number;
  status: DonationStatus;
  currency: string;
  total: number;
  paymentMethodTitle: string | null;
  transactionId: string | null;
  wcDatePaid: string | null;
  wcDateCreated: string | null;
  donor: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  } | null;
  fund: {
    id: string;
    name: string;
    slug: string;
  } | null;
}

export interface SyncLogSummary {
  id: string;
  status: SyncStatus;
  triggeredBy: SyncTrigger;
  fundsAdded: number;
  fundsUpdated: number;
  donorsAdded: number;
  donorsUpdated: number;
  donationsAdded: number;
  donationsUpdated: number;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Session user type (matches augmented NextAuth session)
// ─────────────────────────────────────────────────────────────────────────────

export interface SessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  orgId: string | null;
  orgSlug: string | null;
}
