import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Organization Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createOrgSchema = z.object({
  name: z
    .string()
    .min(2, "Organization name must be at least 2 characters")
    .max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(
      /^[a-z0-9-]+$/,
      "Slug must be lowercase alphanumeric with hyphens only"
    ),
  logoUrl: z.string().url().optional().or(z.literal("")),
  wcBaseUrl: z.string().url("Must be a valid WooCommerce store URL"),
  wcConsumerKey: z
    .string()
    .min(1, "WooCommerce consumer key is required")
    .startsWith("ck_", "Consumer key must start with 'ck_'"),
  wcConsumerSecret: z
    .string()
    .min(1, "WooCommerce consumer secret is required")
    .startsWith("cs_", "Consumer secret must start with 'cs_'"),
  syncEnabled: z.boolean().default(true),
  syncInterval: z.number().int().min(15).max(1440).default(360), // 15 min to 24h
});

export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const updateOrgSchema = createOrgSchema.partial().omit({ slug: true });
export type UpdateOrgInput = z.infer<typeof updateOrgSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// User Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const createOrgAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(24),
  orgId: z.string().cuid("Invalid organization ID"),
}).strict();

export type CreateOrgAdminInput = z.infer<typeof createOrgAdminSchema>;

export const createPhoneOrgAdminSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(24),
  orgId: z.string().cuid("Invalid organization ID"),
}).strict();

export type CreatePhoneOrgAdminInput = z.infer<typeof createPhoneOrgAdminSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Pagination / Query Schemas
// ─────────────────────────────────────────────────────────────────────────────

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(50000).default(20),
  search: z.string().optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;

export const donationFilterSchema = paginationSchema.extend({
  status: z
    .enum([
      "PENDING",
      "PROCESSING",
      "ON_HOLD",
      "COMPLETED",
      "CANCELLED",
      "REFUNDED",
      "FAILED",
      "TRASH",
    ])
    .optional(),
  fundId: z.string().cuid().optional(),
  donorId: z.string().cuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type DonationFilterInput = z.infer<typeof donationFilterSchema>;

export const donorFilterSchema = paginationSchema.extend({
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  minCount: z.coerce.number().int().min(0).optional(),
  maxCount: z.coerce.number().int().min(0).optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  sortBy: z.enum(["lastDonation", "totalSpent", "ordersCount"]).default("lastDonation"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  fundId: z.string().optional(),
}).refine((filters) => !filters.from || !filters.to || filters.from <= filters.to, {
  message: "Start date must be on or before end date",
  path: ["to"],
});

export type DonorFilterInput = z.infer<typeof donorFilterSchema>;


// ─────────────────────────────────────────────────────────────────────────────
// Facebook Ads Ledger
// ─────────────────────────────────────────────────────────────────────────────

export const adLedgerEntrySchema = z.object({
  type: z.enum(["TOP_UP", "SPEND"]),
  amount: z.coerce.number().positive().finite().max(9999999999.99),
  currency: z.literal("BDT").default("BDT"),
  entryDate: z.iso.date(),
  campaignName: z.string().trim().max(200).optional().or(z.literal("")),
  reference: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export type AdLedgerEntryInput = z.infer<typeof adLedgerEntrySchema>;

export const adLedgerQuerySchema = z.object({
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
});

export const adSpendImportRowSchema = z.object({
  date: z.iso.date(),
  campaign: z.string().trim().max(200).optional().or(z.literal("")),
  amount: z.coerce.number().positive().finite().max(9999999999.99),
  currency: z.literal("BDT").default("BDT"),
  reference: z.string().trim().max(200).optional().or(z.literal("")),
  note: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const adSpendImportSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/i),
  rows: z.array(adSpendImportRowSchema).min(1).max(5000),
});
