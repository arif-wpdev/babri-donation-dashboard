import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError, requireAuth } from "@/lib/rbac";
import { adLedgerQuerySchema } from "@/lib/validations/schemas";
import {
  AD_SPEND_CURRENCY,
  dateOnlyInTimeZone,
  nextDateOnly,
  parseDateOnly,
  resolveAdSpendOrgId,
  todayInDhaka,
} from "@/lib/ad-spend";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const money = (value: Prisma.Decimal | number | null | undefined) => Number(value ?? 0);

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;
    const parsed = adLedgerQuerySchema.safeParse({
      from: searchParams.get("from") ?? undefined,
      to: searchParams.get("to") ?? undefined,
    });
    if (!parsed.success) {
      return Response.json({ error: "Invalid date range", issues: parsed.error.flatten() }, { status: 400 });
    }

    const { from, to } = parsed.data;
    if (from && to && from > to) {
      return Response.json({ error: "Start date must be on or before end date" }, { status: 400 });
    }

    const orgId = await resolveAdSpendOrgId(user, searchParams.get("orgId"));
    const today = todayInDhaka();
    const todayDate = parseDateOnly(today)!;
    const periodFrom = from ? parseDateOnly(from) : undefined;
    const periodTo = to ? parseDateOnly(to) : undefined;
    const dateWhere = periodFrom || periodTo
      ? { entryDate: { ...(periodFrom && { gte: periodFrom }), ...(periodTo && { lt: nextDateOnly(periodTo) }) } }
      : {};

    const periodEntriesQuery = from || to
      ? prisma.adLedgerEntry.findMany({
          where: { orgId, status: "POSTED", currency: AD_SPEND_CURRENCY, ...dateWhere },
          orderBy: [{ entryDate: "asc" }, { createdAt: "asc" }],
          select: { type: true, amount: true, entryDate: true },
        })
      : Promise.resolve([] as Array<{ type: "TOP_UP" | "SPEND"; amount: Prisma.Decimal; entryDate: Date }>);
    const [postedTotals, todaySpend, periodEntries, recentEntries] = await Promise.all([
      prisma.adLedgerEntry.groupBy({
        by: ["type"],
        where: { orgId, status: "POSTED", currency: AD_SPEND_CURRENCY },
        _sum: { amount: true },
      }),
      prisma.adLedgerEntry.aggregate({
        where: {
          orgId,
          status: "POSTED",
          type: "SPEND",
          currency: AD_SPEND_CURRENCY,
          entryDate: todayDate,
        },
        _sum: { amount: true },
      }),
      periodEntriesQuery,
      prisma.adLedgerEntry.findMany({
        where: { orgId, currency: AD_SPEND_CURRENCY },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        take: 15,
        select: {
          id: true,
          type: true,
          status: true,
          source: true,
          amount: true,
          currency: true,
          entryDate: true,
          campaignName: true,
          reference: true,
          note: true,
          createdAt: true,
          voidedAt: true,
          voidReason: true,
          createdBy: { select: { name: true, email: true } },
        },
      }),
    ]);

    const topUps = money(postedTotals.find((item) => item.type === "TOP_UP")?._sum.amount);
    const totalSpend = money(postedTotals.find((item) => item.type === "SPEND")?._sum.amount);
    const periodTotals = from || to
      ? periodEntries.reduce(
          (totals, entry) => {
            if (entry.type === "TOP_UP") totals.topUps += money(entry.amount);
            else totals.spend += money(entry.amount);
            return totals;
          },
          { topUps: 0, spend: 0 },
        )
      : { topUps, spend: totalSpend };
    const dailyTotals = new Map<string, { topUp: number; spend: number }>();
    for (const entry of periodEntries) {
      const day = dateOnlyInTimeZone(entry.entryDate, "UTC");
      const totals = dailyTotals.get(day) ?? { topUp: 0, spend: 0 };
      if (entry.type === "TOP_UP") totals.topUp += money(entry.amount);
      else totals.spend += money(entry.amount);
      dailyTotals.set(day, totals);
    }

    const canManage = user.role === "SUPER_ADMIN" || user.role === "ORG_ADMIN";

    return Response.json({
      currency: AD_SPEND_CURRENCY,
      timeZone: "Asia/Dhaka",
      canManage,
      balance: topUps - totalSpend,
      totalTopUps: topUps,
      totalSpend,
      todaySpend: money(todaySpend._sum.amount),
      periodTopUps: periodTotals.topUps,
      periodSpend: periodTotals.spend,
      period: { from: from ?? null, to: to ?? null },
      daily: Array.from(dailyTotals.entries()).map(([date, totals]) => ({ date, ...totals })),
      entries: recentEntries.map((entry) => ({ ...entry, amount: money(entry.amount) })),
    });
  } catch (error) {
    if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.statusCode });
    console.error("[GET /api/ad-spend/summary]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
