import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { startOfMonth } from "date-fns";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth();
    const { searchParams } = request.nextUrl;

    let orgId: string;
    if (user.role === "SUPER_ADMIN") {
      const qOrgId = searchParams.get("orgId");
      if (qOrgId) {
        orgId = qOrgId;
      } else if (user.orgId) {
        orgId = user.orgId;
      } else {
        const firstOrg = await prisma.organization.findFirst();
        if (firstOrg) {
          orgId = firstOrg.id;
        } else {
          return NextResponse.json(
            { error: "Super Admin must provide orgId query parameter" },
            { status: 400 }
          );
        }
      }
    } else {
      if (!user.orgId) {
        return NextResponse.json(
          { error: "User is not associated with an organization" },
          { status: 403 }
        );
      }
      orgId = user.orgId;
    }

    // Date range parsing
    const fromParam = searchParams.get("from");
    const toParam = searchParams.get("to");
    const tzParam = searchParams.get("tz") || "Asia/Dhaka";
    const includeAttribution = searchParams.get("attribution") === "1";
    let fromDate: Date | undefined;
    let toDate: Date | undefined;

    if (fromParam) fromDate = new Date(fromParam);
    if (toParam) toDate = new Date(toParam);

    const rangeWhere = fromDate || toDate ? {
      wcDatePaid: {
        ...(fromDate && { gte: fromDate }),
        ...(toDate && { lte: toDate }),
      }
    } : {};
    const completedDonationWhere: Prisma.DonationWhereInput = {
      orgId,
      status: "COMPLETED",
      ...rangeWhere,
    };

    // 1. Total KPIs (in range)
    const rangeRaisedAggr = await prisma.donation.aggregate({
      where: { orgId, status: "COMPLETED", ...rangeWhere },
      _count: { _all: true },
      _sum: { total: true },
      _avg: { total: true },
      _max: { total: true },
    });
    
    const totalRaised = Number(rangeRaisedAggr._sum.total || 0);
    const averageDonation = Number(rangeRaisedAggr._avg.total || 0);
    const maxDonation = Number(rangeRaisedAggr._max.total || 0);

    // Total Donors (in range)
    // We count unique wcCustomerId (or email/phone if guest) for donations in this range
    // Since prisma doesn't have distinct count easily, we can use groupBy or just query donors who have donations in this range.
    // Run independent donor and KPI aggregations together to avoid serial DB round-trips.
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    
    const startOfThisMonth = startOfMonth(new Date());
    const [donorsInRange, repeatDonorsCount, todayAggr, thisMonthAggr, trendDonations, fundGroups, donationsForFunds] = await Promise.all([
      prisma.donor.count({ where: { orgId, donations: { some: { status: "COMPLETED", ...rangeWhere } } } }),
      prisma.donor.count({ where: { orgId, ordersCount: { gt: 1 }, donations: { some: { status: "COMPLETED", ...rangeWhere } } } }),
      prisma.donation.aggregate({ where: { orgId, status: "COMPLETED", wcDatePaid: { gte: startOfToday, lte: endOfToday } }, _sum: { total: true } }),
      prisma.donation.aggregate({ where: { orgId, status: "COMPLETED", wcDatePaid: { gte: startOfThisMonth } }, _sum: { total: true } }),
      prisma.donation.findMany({ where: { orgId, status: "COMPLETED", ...rangeWhere }, select: { total: true, wcDatePaid: true }, orderBy: { wcDatePaid: "asc" } }),
      prisma.donation.groupBy({ by: ["fundId"], where: { orgId, status: "COMPLETED", ...rangeWhere }, _sum: { total: true } }),
      prisma.donation.findMany({ where: { orgId, status: "COMPLETED", ...rangeWhere }, select: { fundId: true, donorId: true, fund: { select: { name: true } } } }),
    ]);
    const totalDonors = donorsInRange;
    const todayRaised = Number(todayAggr._sum.total || 0);
    const thisMonthRaised = Number(thisMonthAggr._sum.total || 0);

    // 2. Trend Data (based on range)
    // If range <= 24 hours, group by Hour
    // If range <= 31 days, group by Day
    // Otherwise, group by Month
    let grouping: "hour" | "day" | "month" = "day";
    
    if (fromDate && toDate) {
      const diffTime = Math.abs(toDate.getTime() - fromDate.getTime());
      const diffHours = diffTime / (1000 * 60 * 60);
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (diffHours <= 24) grouping = "hour";
      else if (diffDays <= 31) grouping = "day";
      else grouping = "month";
    } else if (fromDate && !toDate) {
      const diffTime = Math.abs(new Date().getTime() - fromDate.getTime());
      const diffHours = diffTime / (1000 * 60 * 60);
      const diffDays = diffTime / (1000 * 60 * 60 * 24);
      
      if (diffHours <= 24) grouping = "hour";
      else if (diffDays <= 31) grouping = "day";
      else grouping = "month";
    } else if (!fromDate && !toDate) {
      grouping = "month"; // All time
    }

    // Default to last 30 days if no range provided, for the trend chart?
    // The user might pass "All time" which means no fromDate.
    const hourFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tzParam, hour: "numeric", hour12: true });
    const dateFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tzParam, month: "short", day: "numeric" });
    const monthFormatter = new Intl.DateTimeFormat("en-US", { timeZone: tzParam, month: "short", year: "numeric" });

    const trendMap = new Map<string, number>();
    trendDonations.forEach((d) => {
      if (!d.wcDatePaid) return;
      
      let key = "";
      if (grouping === "hour") {
        key = hourFormatter.format(d.wcDatePaid); // e.g. "10 AM"
      } else if (grouping === "day") {
        key = dateFormatter.format(d.wcDatePaid); // e.g. "Jul 15"
      } else {
        key = monthFormatter.format(d.wcDatePaid); // e.g. "Jul 2026"
      }
      
      const current = trendMap.get(key) || 0;
      trendMap.set(key, current + Number(d.total));
    });

    const trend = Array.from(trendMap.entries()).map(([dateLabel, amount]) => ({
      name: dateLabel,
      raised: amount,
    }));

    // 3. Fund Breakdown (in range)
    // We group donations by fundId in the selected range
    const fundMap = new Map<string, { name: string, amount: number, uniqueDonors: Set<string> }>();
    
    // Initialize map with grouped sums
    for (const group of fundGroups) {
      if (group.fundId) {
        fundMap.set(group.fundId, { 
          name: "Unknown Fund", 
          amount: Number(group._sum.total || 0), 
          uniqueDonors: new Set() 
        });
      }
    }

    // Populate names and unique donors
    for (const d of donationsForFunds) {
      if (d.fundId && fundMap.has(d.fundId)) {
        const entry = fundMap.get(d.fundId)!;
        entry.name = d.fund?.name || "Unknown Fund";
        if (d.donorId) entry.uniqueDonors.add(d.donorId);
      }
    }

    const fundBreakdown = Array.from(fundMap.values())
      .filter(f => f.name !== "Quiz Registration")
      .map(f => ({
        fundName: f.name,
        amountRaised: f.amount,
        donorsCount: f.uniqueDonors.size
      })).sort((a, b) => b.amountRaised - a.amountRaised);

    // Actual donation attribution. Blank/missing UTM values are grouped as Direct/Unattributed;
    // this is donation revenue attribution, not ad-platform spend.
    const [sourceGroups, campaignGroups] = includeAttribution ? await Promise.all([
      prisma.donation.groupBy({
        by: ["utmSource"],
        where: completedDonationWhere,
        _count: { _all: true },
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
      }),
      prisma.donation.groupBy({
        by: ["utmCampaign", "utmSource"],
        where: completedDonationWhere,
        _count: { _all: true },
        _sum: { total: true },
        orderBy: { _sum: { total: "desc" } },
      }),
    ]) : [[], []];

    // Only query platform IDs that fit the schema's Int columns; other numeric
    // UTM campaign labels remain visible as their original IDs.
    const campaignIds = Array.from(new Set(
      campaignGroups
        .map((group) => group.utmCampaign?.trim() ?? "")
        .filter((value) => /^\d+$/.test(value) && Number(value) <= 2_147_483_647)
        .map(Number),
    ));
    const campaignFunds = campaignIds.length
      ? await prisma.fund.findMany({
          where: {
            orgId,
            OR: [
              { wcProductId: { in: campaignIds } },
              { tdfFundId: { in: campaignIds } },
            ],
          },
          select: { name: true, wcProductId: true, tdfFundId: true },
        })
      : [];
    const campaignNames = new Map<number, string>();
    for (const fund of campaignFunds) {
      if (fund.wcProductId !== null) campaignNames.set(fund.wcProductId, fund.name);
      if (fund.tdfFundId !== null) campaignNames.set(fund.tdfFundId, fund.name);
    }

    const sourceReport = sourceGroups.map((group) => ({
      source: group.utmSource?.trim() || "Direct / Unattributed",
      donations: group._count._all,
      volume: Number(group._sum.total || 0),
    }));
    const campaignReport = campaignGroups.map((group) => ({
      campaign: (() => {
        const rawCampaign = group.utmCampaign?.trim() ?? "";
        if (!rawCampaign || rawCampaign.toLowerCase() === "unknown") return "Unattributed";
        if (/^\d+$/.test(rawCampaign)) return campaignNames.get(Number(rawCampaign)) ?? `Campaign ID ${rawCampaign}`;
        return rawCampaign;
      })(),
      source: group.utmSource?.trim() || "Direct / Unattributed",
      donations: group._count._all,
      volume: Number(group._sum.total || 0),
    }));

    return NextResponse.json({
      kpis: {
        totalRaised,
        todayRaised,
        thisMonthRaised,
        totalDonations: rangeRaisedAggr._count._all,
        totalDonors,
        repeatDonors: repeatDonorsCount,
        averageDonation,
        maxDonation
      },
      trend,
      fundBreakdown,
      sourceReport,
      campaignReport,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/dashboard/stats]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
