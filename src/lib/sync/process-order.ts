import { prisma } from "@/lib/prisma";
import type { Prisma, DonationStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────────────────
// WooCommerce Order shape (relevant fields only)
// ─────────────────────────────────────────────────────────────────────────────
export interface WCLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  subtotal: string;
  total: string;
  price: number;
  sku: string;
}

export interface WCBilling {
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
}

export interface WCOrder {
  id: number;
  status: string;
  currency: string;
  total: string;
  subtotal: string;
  total_tax: string;
  shipping_total: string;
  discount_total: string;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_id: number; // 0 = guest
  customer_note: string;
  billing: WCBilling;
  line_items: WCLineItem[];
  date_created: string | null;
  date_modified: string | null;
  date_completed: string | null;
  date_paid: string | null;
}

const STATUS_MAP: Record<string, DonationStatus> = {
  pending: "PENDING",
  processing: "PROCESSING",
  "on-hold": "ON_HOLD",
  completed: "COMPLETED",
  cancelled: "CANCELLED",
  refunded: "REFUNDED",
  failed: "FAILED",
  trash: "TRASH",
};

/**
 * Processes a single WooCommerce order (sync/webhook) and creates/updates Donor & Donation.
 */
export async function processWooCommerceOrder(order: WCOrder, orgId: string): Promise<"added" | "updated" | "ignored"> {
  const isValidStatus = ["processing", "completed"].includes(order.status.toLowerCase());

  if (!isValidStatus) {
    const existing = await prisma.donation.findUnique({
      where: { orgId_wcOrderId: { orgId, wcOrderId: order.id } },
      select: { id: true, donorId: true },
    });
    
    if (existing) {
      await prisma.donation.delete({
        where: { id: existing.id }
      });
      if (existing.donorId) {
        await recalculateDonorStats(orgId, existing.donorId);
      }
      return "updated"; // Count as updated for sync logs
    }
    
    return "ignored";
  }

  let donationStatus: DonationStatus = STATUS_MAP[order.status.toLowerCase()] || "PENDING";
  
  if (order.status.toLowerCase() === "processing") {
    donationStatus = "COMPLETED";
  }

  // ── Resolve donor ────────────────────────────────────────────────────────
  let donorId: string | null = null;
  const orderPhone = order.billing?.phone || null;
  const normPhone = normalizePhone(orderPhone);
  const orderEmail = order.billing?.email || null;

  if (normPhone) {
    // 1. Try to find donor by normalized phone
    const donor = await prisma.donor.findFirst({
      where: { orgId, normalizedPhone: normPhone },
      select: { id: true },
    });
    donorId = donor?.id ?? null;
  }

  if (!donorId && order.customer_id && order.customer_id > 0) {
    // 2. Try to find by customer_id if phone didn't match or wasn't provided
    const donor = await prisma.donor.findUnique({
      where: {
        orgId_wcCustomerId: { orgId, wcCustomerId: order.customer_id },
      },
      select: { id: true },
    });
    donorId = donor?.id ?? null;
  }

  if (!donorId && (normPhone || orderEmail || order.billing?.first_name)) {
    // 3. Create a new Donor record if neither found (even for guests!)
    const newDonor = await prisma.donor.create({
      data: {
        orgId,
        wcCustomerId: order.customer_id > 0 ? order.customer_id : null,
        firstName: order.billing?.first_name || null,
        lastName: order.billing?.last_name || null,
        email: orderEmail,
        phone: orderPhone,
        normalizedPhone: normPhone,
        billingAddress: order.billing as unknown as Prisma.InputJsonValue,
        isPayingCustomer: true,
        ordersCount: 0, 
        totalSpent: 0,
      },
      select: { id: true },
    });
    donorId = newDonor.id;
  }

  // ── Resolve fund (first line item's product) ─────────────────────────────
  let fundId: string | null = null;
  const firstLineItem = order.line_items?.[0];
  if (firstLineItem?.product_id) {
    const fund = await prisma.fund.findUnique({
      where: {
        orgId_wcProductId: {
          orgId,
          wcProductId: firstLineItem.product_id,
        },
      },
      select: { id: true },
    });
    fundId = fund?.id ?? null;
  }

  // ── Extract UTM/Attribution from meta_data ───────────────────────────────
  let utmSource = null;
  let utmMedium = null;
  let utmCampaign = null;

  if (Array.isArray((order as any).meta_data)) {
    for (const meta of (order as any).meta_data) {
      if (meta.key === "_wc_order_attribution_utm_source") utmSource = meta.value;
      if (meta.key === "_wc_order_attribution_utm_medium") utmMedium = meta.value;
      if (meta.key === "_wc_order_attribution_utm_campaign") utmCampaign = meta.value;
    }
  }

  const parseWCDate = (gmtDate?: string | null, localDate?: string | null) => {
    if (gmtDate) return new Date(gmtDate + (gmtDate.endsWith("Z") ? "" : "Z"));
    if (localDate) return new Date(localDate);
    return null;
  };

  const donationData: Prisma.DonationUncheckedCreateInput = {
    wcOrderId: order.id,
    orgId,
    donorId,
    fundId,
    status: donationStatus,
    currency: order.currency ?? "USD",
    total: parseFloat(order.total ?? "0"),
    subtotal: parseFloat(order.subtotal ?? "0"),
    totalTax: parseFloat(order.total_tax ?? "0"),
    totalShipping: parseFloat(order.shipping_total ?? "0"),
    totalDiscount: parseFloat(order.discount_total ?? "0"),
    paymentMethod: order.payment_method || null,
    paymentMethodTitle: order.payment_method_title || null,
    transactionId: order.transaction_id || null,
    customerNote: order.customer_note || null,
    billingSnapshot: order.billing as unknown as Prisma.InputJsonValue,
    lineItems: order.line_items as unknown as Prisma.InputJsonValue,
    wcDateCreated: parseWCDate((order as any).date_created_gmt, order.date_created),
    wcDateModified: parseWCDate((order as any).date_modified_gmt, order.date_modified),
    wcDateCompleted: parseWCDate((order as any).date_completed_gmt, order.date_completed),
    wcDatePaid: parseWCDate((order as any).date_paid_gmt, order.date_paid),
    utmSource,
    utmMedium,
    utmCampaign,
    syncedAt: new Date(),
  };

  const existing = await prisma.donation.findUnique({
    where: { orgId_wcOrderId: { orgId, wcOrderId: order.id } },
    select: { id: true },
  });

  let result: "added" | "updated" = "added";

  if (existing) {
    await prisma.donation.update({
      where: { orgId_wcOrderId: { orgId, wcOrderId: order.id } },
      data: donationData,
    });
    result = "updated";
  } else {
    await prisma.donation.create({ data: donationData });
  }

  return result;
}

export async function recalculateDonorStats(orgId: string, donorId?: string) {
  if (donorId) {
    await prisma.$executeRaw`
      UPDATE "donors" d
      SET 
        "totalSpent" = COALESCE((SELECT SUM(total) FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED'), 0),
        "ordersCount" = COALESCE((SELECT COUNT(*) FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED'), 0),
        "lastDonationAt" = (SELECT MAX("wcDatePaid") FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED')
      WHERE d."id" = ${donorId}
    `;
  } else {
    await prisma.$executeRaw`
      UPDATE "donors" d
      SET 
        "totalSpent" = COALESCE((SELECT SUM(total) FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED'), 0),
        "ordersCount" = COALESCE((SELECT COUNT(*) FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED'), 0),
        "lastDonationAt" = (SELECT MAX("wcDatePaid") FROM "donations" WHERE "donorId" = d.id AND status = 'COMPLETED')
      WHERE d."orgId" = ${orgId}
    `;
  }
}
