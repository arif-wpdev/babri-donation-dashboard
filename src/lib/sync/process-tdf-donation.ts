import { prisma } from "@/lib/prisma";
import type { Prisma, DonationStatus } from "@prisma/client";
import { normalizePhone } from "@/lib/utils";
import { recalculateDonorStats } from "./process-order";

// ─────────────────────────────────────────────────────────────────────────────
// TDF Custom Plugin Donation shape
// ─────────────────────────────────────────────────────────────────────────────
export interface TdfDonation {
  id: number;
  donor_id?: number;
  donor_info: {
    name: string;
    email: string;
    phone: string;
  };
  amount: number;
  currency: string;
  campaign_id: number;
  campaign_name: string;
  gateway: string;
  transaction_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  utm?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    fbp?: string;
    fbc?: string;
  };
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
 * Processes a single TDF donation (sync/webhook) and creates/updates Donor & Donation.
 */
export async function processTdfDonation(
  donation: TdfDonation,
  orgId: string
): Promise<"added" | "updated" | "ignored"> {
  const isValidStatus = ["processing", "completed"].includes(donation.status.toLowerCase());

  if (!isValidStatus) {
    const existing = await prisma.donation.findUnique({
      where: { orgId_tdfDonationId: { orgId, tdfDonationId: donation.id } },
      select: { id: true, donorId: true },
    });

    if (existing) {
      await prisma.donation.delete({
        where: { id: existing.id },
      });
      if (existing.donorId) {
        await recalculateDonorStats(orgId, existing.donorId);
      }
      return "updated"; // Count as updated for sync logs
    }

    return "ignored";
  }

  let donationStatus: DonationStatus = STATUS_MAP[donation.status.toLowerCase()] || "PENDING";
  if (donation.status.toLowerCase() === "processing") {
    donationStatus = "COMPLETED";
  }

  // ── Resolve Fund (Campaign) ────────────────────────────────────────────────
  let fundId: string | null = null;
  if (donation.campaign_id) {
    // 1. Try to find fund by tdfFundId
    let fund = await prisma.fund.findUnique({
      where: {
        orgId_tdfFundId: {
          orgId,
          tdfFundId: donation.campaign_id,
        },
      },
      select: { id: true },
    });

    if (!fund) {
      // 2. Fallback: try to find by name, then update it with tdfFundId (migrating from WC)
      fund = await prisma.fund.findFirst({
        where: { orgId, name: donation.campaign_name },
        select: { id: true },
      });

      if (fund) {
        await prisma.fund.update({
          where: { id: fund.id },
          data: { tdfFundId: donation.campaign_id },
        });
      }
    }

    if (!fund) {
      // 3. Create new Fund if not found
      const newFund = await prisma.fund.create({
        data: {
          orgId,
          tdfFundId: donation.campaign_id,
          name: donation.campaign_name,
          slug: donation.campaign_name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)+/g, ""),
          status: "publish",
          source: "custom_plugin",
        },
      });
      fundId = newFund.id;
    } else {
      fundId = fund.id;
    }
  }

  // ── Resolve Donor ──────────────────────────────────────────────────────────
  let donorId: string | null = null;
  const orderPhone = donation.donor_info?.phone || null;
  const normPhone = normalizePhone(orderPhone);
  const orderEmail = donation.donor_info?.email || null;

  if (normPhone) {
    const donor = await prisma.donor.findFirst({
      where: { orgId, normalizedPhone: normPhone },
      select: { id: true },
    });
    donorId = donor?.id ?? null;
  }

  if (!donorId && donation.donor_id && donation.donor_id > 0) {
    const donor = await prisma.donor.findUnique({
      where: {
        orgId_tdfDonorId: { orgId, tdfDonorId: donation.donor_id },
      },
      select: { id: true },
    });
    donorId = donor?.id ?? null;
  }

  if (!donorId && (normPhone || orderEmail || donation.donor_info?.name)) {
    const names = (donation.donor_info?.name || "").trim().split(" ");
    const firstName = names[0] || null;
    const lastName = names.length > 1 ? names.slice(1).join(" ") : null;

    const newDonor = await prisma.donor.create({
      data: {
        orgId,
        tdfDonorId: donation.donor_id && donation.donor_id > 0 ? donation.donor_id : null,
        firstName,
        lastName,
        email: orderEmail,
        phone: orderPhone,
        normalizedPhone: normPhone,
        isPayingCustomer: true,
        ordersCount: 0,
        totalSpent: 0,
        source: "custom_plugin",
      },
      select: { id: true },
    });
    donorId = newDonor.id;
  }

  const parseDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    
    // If it's already an ISO string with Z or offset, use it directly
    if (dateStr.endsWith("Z") || dateStr.match(/[+-]\d\d:\d\d$/)) {
      return new Date(dateStr);
    }
    
    // Replace space with T to make it a valid ISO string before offset
    const isoString = dateStr.trim().replace(" ", "T");
    
    // Append +06:00 to correctly parse it as Bangladesh local time
    return new Date(isoString + "+06:00");
  };

  const donationData: Prisma.DonationUncheckedCreateInput = {
    tdfDonationId: donation.id,
    orgId,
    donorId,
    fundId,
    status: donationStatus,
    currency: donation.currency ?? "BDT",
    total: donation.amount,
    subtotal: donation.amount,
    paymentMethod: donation.gateway || null,
    paymentMethodTitle: donation.gateway || null,
    transactionId: donation.transaction_id || null,
    wcDateCreated: parseDate(donation.created_at),
    wcDateModified: parseDate(donation.updated_at),
    wcDateCompleted: parseDate(donation.updated_at),
    wcDatePaid: parseDate(donation.updated_at),
    utmSource: donation.utm?.utm_source || null,
    utmMedium: donation.utm?.utm_medium || null,
    utmCampaign: donation.utm?.utm_campaign || null,
    source: "custom_plugin",
    syncedAt: new Date(),
    lineItems: [{ name: donation.campaign_name, total: donation.amount }],
  };

  const existing = await prisma.donation.findUnique({
    where: { orgId_tdfDonationId: { orgId, tdfDonationId: donation.id } },
    select: { id: true },
  });

  let result: "added" | "updated" = "added";

  if (existing) {
    await prisma.donation.update({
      where: { orgId_tdfDonationId: { orgId, tdfDonationId: donation.id } },
      data: donationData,
    });
    result = "updated";
  } else {
    await prisma.donation.create({ data: donationData });
  }

  // Recalculate stats for this specific donor so they immediately appear correctly
  if (donorId) {
    await recalculateDonorStats(orgId, donorId);
  }

  return result;
}
