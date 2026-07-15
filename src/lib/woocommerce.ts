import WooCommerceRestApi from "@woocommerce/woocommerce-rest-api";
import { decrypt } from "@/lib/encryption";

// ─────────────────────────────────────────────────────────────────────────────
// WooCommerce Client Factory
//
// Creates a scoped WooCommerce REST API client for a given organization.
// Credentials are decrypted at call time — never stored in plaintext in memory
// beyond the duration of a sync run.
// ─────────────────────────────────────────────────────────────────────────────

export interface WooCommerceOrg {
  wcBaseUrl: string;
  wcConsumerKey: string;    // stored encrypted
  wcConsumerSecret: string; // stored encrypted
}

/**
 * Creates a WooCommerce REST API client for the given org.
 * Automatically decrypts stored credentials.
 */
export function createWooCommerceClient(org: WooCommerceOrg) {
  const consumerKey = decrypt(org.wcConsumerKey);
  const consumerSecret = decrypt(org.wcConsumerSecret);

  return new WooCommerceRestApi({
    url: org.wcBaseUrl,
    consumerKey,
    consumerSecret,
    version: "wc/v3",
    queryStringAuth: false, // Use OAuth header auth (more secure)
  });
}

export type WooCommerceClient = ReturnType<typeof createWooCommerceClient>;

// ─────────────────────────────────────────────────────────────────────────────
// Pagination helper
//
// WooCommerce paginates results (default 10 per page, max 100).
// This fetches ALL pages of a given endpoint.
// ─────────────────────────────────────────────────────────────────────────────

export async function fetchAllPages<T>(
  client: WooCommerceClient,
  endpoint: string,
  params: Record<string, unknown> = {}
): Promise<T[]> {
  const results: T[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await client.get(endpoint, {
      ...params,
      per_page: perPage,
      page,
    });

    const data = response.data as T[];

    if (!data || data.length === 0) break;

    results.push(...data);

    // Check if there are more pages via response headers
    const totalPages = parseInt(
      (response.headers as Record<string, string>)["x-wp-totalpages"] ?? "1",
      10
    );

    if (page >= totalPages) break;
    page++;
  }

  return results;
}
