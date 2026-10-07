const GREENWEB_SMS_ENDPOINT = "https://api.bdbulksms.net/api.php?json";
const SMS_REQUEST_TIMEOUT_MS = 10_000;

type GreenwebSmsResult = {
  to?: unknown;
  status?: unknown;
  statusmsg?: unknown;
};

export function isGreenwebSmsAccepted(payload: unknown, recipient: string) {
  if (!Array.isArray(payload)) return false;
  return payload.some((item: GreenwebSmsResult) =>
    item &&
    typeof item === "object" &&
    item.status === "SENT" &&
    typeof item.to === "string" &&
    normalizeGreenwebPhone(item.to) === normalizeGreenwebPhone(recipient),
  );
}

function normalizeGreenwebPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.startsWith("00880")) return digits.slice(2);
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("01") && digits.length === 11) return `88${digits}`;
  return digits;
}

export async function sendGreenwebOtp(input: { token: string; recipient: string; message: string }) {
  const form = new URLSearchParams({
    token: input.token,
    to: input.recipient,
    message: input.message,
  });

  let response: Response;
  try {
    response = await fetch(GREENWEB_SMS_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8", Accept: "application/json" },
      body: form,
      cache: "no-store",
      signal: AbortSignal.timeout(SMS_REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new Error("SMS delivery service is temporarily unavailable");
  }

  if (!response.ok) throw new Error("SMS delivery service rejected the request");
  const payload: unknown = await response.json().catch(() => null);
  if (!isGreenwebSmsAccepted(payload, input.recipient)) {
    throw new Error("SMS delivery service did not confirm delivery");
  }
}
