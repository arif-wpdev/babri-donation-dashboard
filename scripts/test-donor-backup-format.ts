import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { donorToBackupRow, makeDonorBackupCsv, makeDonorBackupXlsx } from "../src/lib/donor-backup-format";

const rows = [
  donorToBackupRow({
    firstName: "আমেনা",
    lastName: null,
    email: "amena@example.com",
    phone: "01700000000",
    normalizedPhone: null,
    totalSpent: "1250.50",
    ordersCount: 2,
    wcDateCreated: new Date("2026-10-02T00:00:00.000Z"),
    lastDonationAt: new Date("2026-10-02T00:00:00.000Z"),
    donations: [{
      wcDatePaid: new Date("2026-10-02T00:00:00.000Z"),
      wcDateCreated: new Date("2026-10-02T00:00:00.000Z"),
      utmSource: "facebook",
      utmCampaign: "Ramadan",
      fund: { name: "General" },
    }],
  }, () => "2 Oct, 26"),
];

const csv = makeDonorBackupCsv(rows);
assert.equal(csv.charCodeAt(0), 0xfeff, "CSV should include a UTF-8 BOM for spreadsheet compatibility");
assert.ok(csv.includes("আমেনা"), "CSV should preserve Bengali donor names");
assert.ok(csv.includes("2 Oct, 26"), "CSV should include the formatted donation date");

const xlsxBuffer = makeDonorBackupXlsx(rows);
const workbook = XLSX.read(xlsxBuffer, { type: "buffer" });
assert.deepEqual(workbook.SheetNames, ["Donors"]);
const xlsxRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Donors!);
assert.equal(xlsxRows.length, 1);
assert.equal(xlsxRows[0]?.Name, "আমেনা");
assert.equal(xlsxRows[0]?.["Total Donation (Tk)"], 1250.5);
console.log("Donor backup format tests passed (CSV + XLSX, Bengali and values).");
