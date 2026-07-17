import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth, ApiError } from "@/lib/rbac";
import { subMonths, startOfMonth, format } from "date-fns";

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

    // 1. Total KPIs (in range)
    const rangeDonationsCount = await prisma.donation.count({ 
      where: { orgId, ...rangeWhere } 
    });
    
    const rangeRaisedAggr = await prisma.donation.aggregate({
      where: { orgId, ...rangeWhere },
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
    const donorsInRange = await prisma.donor.count({
      where: {
        orgId,
        donations: {
          some: rangeWhere
        }
      }
    });
    
    const totalDonors = donorsInRange;

    // Repeat Donors: Donors who donated in this range AND have >1 total orders
    const repeatDonorsCount = await prisma.donor.count({
      where: {
        orgId,
        ordersCount: { gt: 1 },
        donations: {
          some: rangeWhere
        }
      }
    });

    // Today's Donation (always fixed to today)
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    
    const todayAggr = await prisma.donation.aggregate({
      where: { 
        orgId, 
        wcDatePaid: { gte: startOfToday, lte: endOfToday } 
      },
      _sum: { total: true },
    });
    const todayRaised = Number(todayAggr._sum.total || 0);

    // This Month's Donation (always fixed to this calendar month)
    const startOfThisMonth = startOfMonth(new Date());
    const thisMonthAggr = await prisma.donation.aggregate({
      where: { 
        orgId, 
        wcDatePaid: { gte: startOfThisMonth } 
      },
      _sum: { total: true },
    });
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
    const trendDonations = await prisma.donation.findMany({
      where: {
        orgId,
        ...rangeWhere
      },
      select: {
        total: true,
        wcDatePaid: true,
      },
      orderBy: { wcDatePaid: "asc" },
    });

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
    const fundGroups = await prisma.donation.groupBy({
      by: ['fundId'],
      where: { orgId, ...rangeWhere },
      _sum: { total: true },
    });

    // We also need donor counts per fund in this range.
    // groupBy doesn't support distinct count of donorId natively with relation fields in an easy way, 
    // so we can fetch all donations in range with fund and donorId and calculate in memory (fine for thousands, maybe slow for millions).
    const donationsForFunds = await prisma.donation.findMany({
      where: { orgId, ...rangeWhere },
      select: {
        fundId: true,
        donorId: true,
        fund: { select: { name: true } },
      }
    });

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

    return NextResponse.json({
      kpis: {
        totalRaised,
        todayRaised,
        thisMonthRaised,
        totalDonations: rangeDonationsCount,
        totalDonors,
        repeatDonors: repeatDonorsCount,
        averageDonation,
        maxDonation
      },
      trend,
      fundBreakdown,
    });
  } catch (error) {
    if (error instanceof ApiError) {
      return NextResponse.json({ error: error.message }, { status: error.statusCode });
    }
    console.error("[GET /api/dashboard/stats]", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
