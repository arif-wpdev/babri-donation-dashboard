import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { processTdfDonation, type TdfDonation } from "@/lib/sync/process-tdf-donation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  const { orgId } = await params;

  // 1. Fetch organization and verify webhook secret is set
  const org = await prisma.organization.findUnique({
    where: { id: orgId, deletedAt: null },
    select: { id: true, tdfWebhookSecret: true },
  });

  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  if (!org.tdfWebhookSecret) {
    return NextResponse.json(
      { error: "Webhook secret is not configured for this organization" },
      { status: 400 }
    );
  }

  // 2. Read the raw body for signature verification
  const rawBody = await request.text();
  const signature = request.headers.get("x-tdf-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 401 });
  }

  // 3. Verify HMAC SHA256 Signature
  const expectedSignature = crypto
    .createHmac("sha256", org.tdfWebhookSecret)
    .update(rawBody)
    .digest("hex");

  if (signature !== expectedSignature) {
    console.error(`[Webhook TDF] Invalid signature for org ${orgId}`);
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  // 4. Parse the payload
  let payload: { event: string; donation: TdfDonation };
  try {
    payload = JSON.parse(rawBody);
  } catch (err) {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (payload.event !== "donation.completed" || !payload.donation) {
    // Only process completed donations
    return NextResponse.json({ status: "ignored", reason: "Not a donation.completed event" });
  }

  // 5. Process the donation
  try {
    const result = await processTdfDonation(payload.donation, orgId);
    return NextResponse.json({ success: true, action: result });
  } catch (error: any) {
    console.error(`[Webhook TDF] Processing error for org ${orgId}:`, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
