import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes a Bangladeshi phone number to 11 digits (01XXXXXXXXX)
 * Supports inputs like: +8801717038656, 1717038656, +01717038656, 01717038656
 */
export function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  
  // Remove all non-numeric characters
  let clean = phone.replace(/\D/g, "");

  // If starts with 880 and length >= 13, remove 88
  if (clean.startsWith("880") && clean.length >= 13) {
    clean = clean.substring(2);
  } else if (clean.startsWith("88") && clean.length === 13) {
    clean = clean.substring(2);
  }

  // If length is 10 and starts with 1, prepend 0
  if (clean.length === 10 && clean.startsWith("1")) {
    clean = "0" + clean;
  }

  // We should return the number if it's 11 digits starting with 01
  if (clean.length === 11 && clean.startsWith("01")) {
    return clean;
  }

  // If it still doesn't match the standard BD format, return the cleaned numeric string anyway
  return clean || null;
}

export function formatNumber(value: number, isCurrency = true, compact = false): string {
  const options: Intl.NumberFormatOptions = {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  };

  if (compact) {
    options.notation = "compact";
    options.compactDisplay = "short";
  }

  const formatted = new Intl.NumberFormat('en-IN', options).format(value);
  
  return isCurrency ? `৳${formatted}` : formatted;
}
