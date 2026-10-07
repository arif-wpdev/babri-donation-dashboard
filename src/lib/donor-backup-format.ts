import * as XLSX from "xlsx";

export const DONOR_EXPORT_COLUMNS = [
  "Name",
  "Email",
  "Phone",
  "Total Donation (Tk)",
  "Donations",
  "Latest Fund",
  "Last Donated",
  "Source",
  "Campaign",
] as const;

export function donorToBackupRow(donor: {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  totalSpent: unknown;
  ordersCount: number;
  wcDateCreated: Date | null;
  lastDonationAt: Date | null;
  donations: Array<{
    wcDatePaid: Date | null;
    wcDateCreated: Date | null;
    utmSource: string | null;
    utmCampaign: string | null;
    fund: { name: string } | null;
  }>;
}, formatDate: (date: Date | null) => string) {
  const name = donor.firstName || donor.lastName
    ? `${donor.firstName || ""} ${donor.lastName || ""}`.trim()
    : donor.email || donor.phone || donor.normalizedPhone || "Anonymous";
  const latestDonation = donor.donations[0];
  const campaign = latestDonation?.utmCampaign?.trim();

  return {
    Name: name,
    Email: donor.email || "-",
    Phone: donor.phone || donor.normalizedPhone || "-",
    "Total Donation (Tk)": Number(donor.totalSpent || 0),
    Donations: donor.ordersCount,
    "Latest Fund": latestDonation?.fund?.name || "General",
    "Last Donated": formatDate(latestDonation?.wcDatePaid || donor.lastDonationAt || donor.wcDateCreated),
    Source: latestDonation?.utmSource || "Direct",
    Campaign: campaign && campaign.toLowerCase() !== "unknown" ? campaign : "Organic / Unattributed",
  };
}

export function makeDonorBackupXlsx(rows: Array<Record<string, unknown>>) {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...DONOR_EXPORT_COLUMNS] });
  XLSX.utils.book_append_sheet(workbook, sheet, "Donors");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function makeDonorBackupCsv(rows: Array<Record<string, unknown>>) {
  const sheet = XLSX.utils.json_to_sheet(rows, { header: [...DONOR_EXPORT_COLUMNS] });
  return `\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`;
}
