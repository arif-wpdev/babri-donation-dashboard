import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAuth } from "@/lib/rbac";
import { ensureAdSpendWriter, resolveAdSpendOrgId } from "@/lib/ad-spend";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireAuth();
    ensureAdSpendWriter(user.role);
    const orgId = await resolveAdSpendOrgId(user, request.nextUrl.searchParams.get("orgId"));
    const { id } = await params;
    const reason = request.nextUrl.searchParams.get("reason")?.trim();
    if (!reason) return Response.json({ error: "A void reason is required" }, { status: 400 });

    const result = await prisma.adLedgerEntry.updateMany({
      where: { id, orgId, status: "POSTED" },
      data: { status: "VOID", voidedAt: new Date(), voidReason: reason },
    });
    if (!result.count) return Response.json({ error: "Posted ledger entry not found" }, { status: 404 });

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[DELETE /api/ad-spend/entries/[id]]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
