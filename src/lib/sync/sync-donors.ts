import { prisma } from "@/lib/prisma";
import { fetchAllPages, type WooCommerceClient } from "@/lib/woocommerce";
import type { Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────────────────────
// WooCommerce Customer shape (relevant fields only)
// ─────────────────────────────────────────────────────────────────────────────
interface WCCustomer {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  is_paying_customer: boolean;
  orders_count: number;
  total_spent: string;
  billing: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
    email: string;
    phone: string;
  };
  shipping: {
    first_name: string;
    last_name: string;
    company: string;
    address_1: string;
    address_2: string;
    city: string;
    state: string;
    postcode: string;
    country: string;
  };
  date_created: string | null;
  date_modified: string | null;
}

export interface SyncDonorsResult {
  total: number;
  added: number;
  updated: number;
}

import { normalizePhone } from "@/lib/utils";

/**
 * Fetches all WooCommerce customers for an org and upserts them as Donors.
 * Guest donors (id = 0) are handled at the Donation sync stage via billing data.
 */
export async function syncDonors(
  client: WooCommerceClient,
  orgId: string
): Promise<SyncDonorsResult> {
  // Registered customers only (id > 0)
  const customers = await fetchAllPages<WCCustomer>(client, "customers", {
    role: "all",
  });

  let added = 0;
  let updated = 0;

  for (const customer of customers) {
    // Skip guest/anonymous entries (id should always be > 0 from this endpoint)
    if (!customer.id) continue;

    const rawPhone = customer.phone || customer.billing?.phone || null;
    const donorData: Prisma.DonorUncheckedCreateInput = {
      wcCustomerId: customer.id,
      orgId,
      firstName: customer.first_name || null,
      lastName: customer.last_name || null,
      email: customer.email || null,
      phone: rawPhone,
      normalizedPhone: normalizePhone(rawPhone),
      username: customer.username || null,
      avatarUrl: customer.avatar_url || null,
      billingAddress: customer.billing as Prisma.InputJsonValue,
      shippingAddress: customer.shipping as Prisma.InputJsonValue,
      totalSpent: parseFloat(customer.total_spent ?? "0"),
      ordersCount: customer.orders_count ?? 0,
      isPayingCustomer: customer.is_paying_customer ?? false,
      wcDateCreated: customer.date_created
        ? new Date(customer.date_created)
        : null,
      wcDateModified: customer.date_modified
        ? new Date(customer.date_modified)
        : null,
      syncedAt: new Date(),
    };

    const existing = await prisma.donor.findUnique({
      where: { orgId_wcCustomerId: { orgId, wcCustomerId: customer.id } },
      select: { id: true },
    });

    if (existing) {
      await prisma.donor.update({
        where: { orgId_wcCustomerId: { orgId, wcCustomerId: customer.id } },
        data: donorData,
      });
      updated++;
    } else {
      await prisma.donor.create({ data: donorData });
      added++;
    }
  }

  return { total: customers.length, added, updated };
}
