import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import * as XLSX from "xlsx";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAuth } from "@/lib/rbac";
import { adSpendImportSchema } from "@/lib/validations/schemas";
import { ensureAdSpendWriter, parseDateOnly, resolveAdSpendOrgId } from "@/lib/ad-spend";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const EXPECTED_COLUMNS = ["date", "campaign", "amount", "currency", "reference", "note"];

function normaliseHeader(header: unknown) {
  return String(header ?? "").trim().toLowerCase().replace(/[\s_-]+/g, "");
}

function parseDateCell(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;
    return `${String(date.y).padStart(4, "0")}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
  }
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  // Accept explicit day-first dates (d/M/yyyy, dd-MM-yyyy) used in local sheets.
  const dayFirst = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (dayFirst) {
    const [, d, m, y] = dayFirst;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

function parseSheet(file: Buffer) {
  const workbook = XLSX.read(file, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("Workbook has no worksheet");
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "", raw: true });
  if (!rows.length) throw new Error("Worksheet has no data rows");

  const aliases: Record<string, string> = {
    date: "date", spenddate: "date", entrydate: "date", day: "date",
    campaign: "campaign", campaignname: "campaign", campaignid: "campaign",
    amount: "amount", spend: "amount", dailyspend: "amount",
    currency: "currency", reference: "reference", transactionid: "reference", externalid: "reference",
    note: "note", notes: "note",
  };

  return rows.map((row, index) => {
    const canonical: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const mapped = aliases[normaliseHeader(key)];
      if (mapped) canonical[mapped] = value;
    }
    return {
      rowNumber: index + 2,
      raw: canonical,
      input: {
        date: parseDateCell(canonical.date),
        campaign: canonical.campaign ? String(canonical.campaign).trim() : "",
        amount: typeof canonical.amount === "string"
          ? String(canonical.amount).replace(/[,৳\s]/g, "")
          : canonical.amount,
        currency: canonical.currency ? String(canonical.currency).trim().toUpperCase() : "BDT",
        reference: canonical.reference ? String(canonical.reference).trim() : "",
        note: canonical.note ? String(canonical.note).trim() : "",
      },
    };
  });
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    ensureAdSpendWriter(user.role);
    const orgId = await resolveAdSpendOrgId(user, request.nextUrl.searchParams.get("orgId"));
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Upload an .xlsx, .xls or .csv file" }, { status: 400 });
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return Response.json({ error: "Only .xlsx, .xls or .csv files are supported" }, { status: 400 });
    if (file.size > MAX_UPLOAD_BYTES) return Response.json({ error: "File must be 5 MB or smaller" }, { status: 413 });

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const batchData = parseSheet(bytes);
    const parsedRows = batchData.map((row) => ({
      rowNumber: row.rowNumber,
      raw: row.raw,
      parsed: adSpendImportSchema.shape.rows.element.safeParse(row.input),
    }));

    const validRows = parsedRows.filter((row) => row.parsed.success);
    const existingBatch = await prisma.adSpendImportBatch.findUnique({
      where: { orgId_fileHash: { orgId, fileHash } },
      select: { id: true, createdAt: true, rowCount: true },
    });
    if (existingBatch) {
      return Response.json({
        error: "This exact file was already imported",
        duplicate: true,
        batch: existingBatch,
        validCount: validRows.length,
        invalidRows: parsedRows.filter((row) => !row.parsed.success).map((row) => ({
          rowNumber: row.rowNumber,
          errors: row.parsed.success ? [] : row.parsed.error.issues.map((issue) => issue.message),
        })),
      }, { status: 409 });
    }

    if (form.get("confirm") !== "true") {
      return Response.json({
        preview: true,
        fileName: file.name,
        fileHash,
        totalRows: parsedRows.length,
        validCount: validRows.length,
        invalidRows: parsedRows.filter((row) => !row.parsed.success).map((row) => ({
          rowNumber: row.rowNumber,
          values: row.raw,
          errors: row.parsed.success ? [] : row.parsed.error.issues.map((issue) => issue.message),
        })),
        sampleRows: validRows.slice(0, 10).map((row) => ({ rowNumber: row.rowNumber, ...row.parsed.data })),
      });
    }

    if (!validRows.length) return Response.json({ error: "No valid rows to import" }, { status: 400 });
    const confirmedMeta = adSpendImportSchema.safeParse({
      fileName: file.name,
      fileHash,
      rows: validRows.map((row) => row.parsed.success ? row.parsed.data : null),
    });
    if (!confirmedMeta.success) return Response.json({ error: "Import validation failed" }, { status: 400 });

    const batch = await prisma.$transaction(async (tx) => {
      const createdBatch = await tx.adSpendImportBatch.create({
        data: {
          orgId,
          fileName: file.name,
          fileHash,
          rowCount: validRows.length,
          importedById: user.id,
        },
      });
      await tx.adLedgerEntry.createMany({
        data: validRows.map((row) => {
          if (!row.parsed.success) throw new Error("Unexpected invalid row in validated import");
          const data = row.parsed.data;
          const entryDate = parseDateOnly(data.date);
          if (!entryDate) throw new Error(`Invalid date on spreadsheet row ${row.rowNumber}`);
          return {
            orgId,
            type: "SPEND" as const,
            status: "POSTED" as const,
            source: "IMPORT" as const,
            amount: new Prisma.Decimal(data.amount.toFixed(2)),
            currency: data.currency,
            entryDate,
            campaignName: data.campaign || null,
            reference: data.reference || null,
            note: data.note || null,
            importBatchId: createdBatch.id,
            createdById: user.id,
          };
        }),
      });
      return createdBatch;
    });

    return Response.json({ success: true, batch: { id: batch.id, fileName: batch.fileName, rowCount: batch.rowCount } }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    if (error instanceof Error) return Response.json({ error: error.message }, { status: 400 });
    console.error("[POST /api/ad-spend/import]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
