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
  name: z.string().min(2).max(100),
  email: z.string().email(),
  password: z
    .string()
    .min(12, "Password must be at least 12 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[a-z]/, "Must contain a lowercase letter")
    .regex(/[0-9]/, "Must contain a number"),
  orgId: z.string().cuid("Invalid organization ID"),
});

export type CreateOrgAdminInput = z.infer<typeof createOrgAdminSchema>;

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
  sortBy: z.enum(["lastDonation", "totalSpent", "ordersCount"]).default("lastDonation"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  fundId: z.string().optional(),
});

export type DonorFilterInput = z.infer<typeof donorFilterSchema>;
