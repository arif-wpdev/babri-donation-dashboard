import { fromZonedTime } from "date-fns-tz";

const DONATION_TIME_ZONE = "Asia/Dhaka";

export function getDonorDonationDateBounds(from?: string, to?: string) {
  const gte = from ? fromZonedTime(`${from}T00:00:00.000`, DONATION_TIME_ZONE) : undefined;
  let lt: Date | undefined;
  if (to) {
    const nextDay = new Date(`${to}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    lt = fromZonedTime(`${nextDay.toISOString().slice(0, 10)}T00:00:00.000`, DONATION_TIME_ZONE);
  }
  return { gte, lt };
}

export function matchesPeriodDonationFilters(input: {
  total: number;
  count: number;
  minAmount?: number;
  maxAmount?: number;
  minCount?: number;
  maxCount?: number;
}) {
  return (input.minAmount === undefined || input.total >= input.minAmount) &&
    (input.maxAmount === undefined || input.total <= input.maxAmount) &&
    (input.minCount === undefined || input.count >= input.minCount) &&
    (input.maxCount === undefined || input.count <= input.maxCount);
}
