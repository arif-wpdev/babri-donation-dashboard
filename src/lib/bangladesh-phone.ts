export function normalizeBangladeshMobile(input: string) {
  const value = input.trim().replace(/[\s().-]/g, "");
  if (/^01[3-9]\d{8}$/.test(value)) return `+88${value}`;
  if (/^8801[3-9]\d{8}$/.test(value)) return `+${value}`;
  if (/^\+8801[3-9]\d{8}$/.test(value)) return value;
  return null;
}
