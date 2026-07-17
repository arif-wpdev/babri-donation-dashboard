import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { processWooCommerceOrder, recalculateDonorStats, type WCOrder } from "@/lib/sync/process-order";
import { decrypt } from "@/lib/encryption";
import crypto from "crypto";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const orgId = (await params).orgId;
    
    // 1. Fetch organization
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, wcWebhookSecret: true, syncEnabled: true }
    });

    if (!org) {
      return Response.json({ error: "Organization not found" }, { status: 404 });
    }

    if (!org.syncEnabled) {
      return Response.json({ error: "Sync is disabled for this organization" }, { status: 403 });
    }

    // 2. Read headers
    const signature = request.headers.get("x-wc-webhook-signature");
    const topic = request.headers.get("x-wc-webhook-topic"); // e.g. "order.created"

    if (!signature || !topic) {
      return Response.json({ error: "Missing required WooCommerce headers" }, { status: 400 });
    }

    // Only process order events
    if (!topic.startsWith("order.")) {
      return Response.json({ message: "Ignored non-order event" }, { status: 200 });
    }

    const rawBody = await request.text();

    // 3. Verify signature if a secret is configured
    if (org.wcWebhookSecret) {
      const decryptedSecret = decrypt(org.wcWebhookSecret);
      const expectedSignature = crypto
        .createHmac("sha256", decryptedSecret)
        .update(rawBody, "utf8")
        .digest("base64");

      if (signature !== expectedSignature) {
        console.error(`[Webhook] Signature mismatch for org ${orgId}`);
        return Response.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    // 4. Parse payload and process order
    const order = JSON.parse(rawBody) as WCOrder;
    
    const result = await processWooCommerceOrder(order, org.id);
    
    // Recalculate stats for this specific donor to be efficient
    await recalculateDonorStats(org.id);

    return Response.json({ success: true, action: result, orderId: order.id }, { status: 200 });
  } catch (error) {
    console.error("[Webhook Error]", error);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
