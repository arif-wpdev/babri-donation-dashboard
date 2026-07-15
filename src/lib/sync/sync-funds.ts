import { prisma } from "@/lib/prisma";
import { fetchAllPages, type WooCommerceClient } from "@/lib/woocommerce";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// WooCommerce Product shape (relevant fields only)
// ─────────────────────────────────────────────────────────────────────────────
interface WCProduct {
  id: number;
  name: string;
  slug: string;
  status: string;
  description: string;
  short_description: string;
  price: string;
  regular_price: string;
  sale_price: string;
  total_sales: number;
  categories: Array<{ id: number; name: string; slug: string }>;
  images: Array<{ id: number; src: string; alt: string }>;
  meta_data: Array<{ key: string; value: unknown }>;
  date_created: string | null;
  date_modified: string | null;
}

export interface SyncFundsResult {
  total: number;
  added: number;
  updated: number;
}

/**
 * Fetches all WooCommerce products for an org and upserts them as Funds.
 * Uses composite unique key [orgId, wcProductId] for upsert logic.
 */
export async function syncFunds(
  client: WooCommerceClient,
  orgId: string
): Promise<SyncFundsResult> {
  const products = await fetchAllPages<WCProduct>(client, "products", {
    status: "any", // Sync all statuses including drafts
  });

  let added = 0;
  let updated = 0;

  for (const product of products) {
    const fundData: Prisma.FundUncheckedCreateInput = {
      wcProductId: product.id,
      orgId,
      name: product.name,
      slug: product.slug,
      description: product.description || null,
      shortDescription: product.short_description || null,
      status: product.status,
      price: product.price ? parseFloat(product.price) : null,
      regularPrice: product.regular_price
        ? parseFloat(product.regular_price)
        : null,
      salePrice: product.sale_price ? parseFloat(product.sale_price) : null,
      totalSales: product.total_sales ?? 0,
      categories: product.categories as Prisma.InputJsonValue,
      images: product.images as Prisma.InputJsonValue,
      metaData: product.meta_data as Prisma.InputJsonValue,
      wcCreatedAt: product.date_created
        ? new Date(product.date_created)
        : null,
      wcUpdatedAt: product.date_modified
        ? new Date(product.date_modified)
        : null,
      syncedAt: new Date(),
    };

    const existing = await prisma.fund.findUnique({
      where: { orgId_wcProductId: { orgId, wcProductId: product.id } },
      select: { id: true },
    });

    if (existing) {
      await prisma.fund.update({
        where: { orgId_wcProductId: { orgId, wcProductId: product.id } },
        data: fundData,
      });
      updated++;
    } else {
      await prisma.fund.create({ data: fundData });
      added++;
    }
  }

  return { total: products.length, added, updated };
}
