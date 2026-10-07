import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAuth } from "@/lib/rbac";
import { adLedgerEntrySchema } from "@/lib/validations/schemas";
import { ensureAdSpendWriter, parseDateOnly, resolveAdSpendOrgId } from "@/lib/ad-spend";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    ensureAdSpendWriter(user.role);
    const orgId = await resolveAdSpendOrgId(user, request.nextUrl.searchParams.get("orgId"));

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Request body must be valid JSON" }, { status: 400 });
    }

    const parsed = adLedgerEntrySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({ error: "Validation failed", issues: parsed.error.flatten() }, { status: 400 });
    }

    const entryDate = parseDateOnly(parsed.data.entryDate);
    if (!entryDate) return Response.json({ error: "Invalid entry date" }, { status: 400 });

    const entry = await prisma.adLedgerEntry.create({
      data: {
        orgId,
        type: parsed.data.type,
        amount: new Prisma.Decimal(parsed.data.amount.toFixed(2)),
        currency: parsed.data.currency,
        entryDate,
        campaignName: parsed.data.campaignName || null,
        reference: parsed.data.reference || null,
        note: parsed.data.note || null,
        source: "MANUAL",
        createdById: user.id,
      },
      select: {
        id: true,
        type: true,
        amount: true,
        currency: true,
        entryDate: true,
        campaignName: true,
        createdAt: true,
      },
    });

    return Response.json({ data: { ...entry, amount: Number(entry.amount) } }, { status: 201 });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[POST /api/ad-spend/entries]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
