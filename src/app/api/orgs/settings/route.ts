import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !session.user.orgId) {
      return NextResponse.json({ error: "Unauthorized or missing organization" }, { status: 401 });
    }

    const orgId = session.user.orgId;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: {
        wcBaseUrl: true,
        wcConsumerKey: true,
        wcWebhookSecret: true,
        tdfApiKey: true,
        tdfWebhookSecret: true,
        syncEnabled: true,
        lastSyncedAt: true,
      }
    });

    if (!org) {
      return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    }

    // Decrypt consumer key to mask it
    let decryptedKey = "";
    try {
      if (org.wcConsumerKey) {
        decryptedKey = decrypt(org.wcConsumerKey);
      }
    } catch (err) {
      console.warn("Failed to decrypt wcConsumerKey:", err);
      // Fallback in case it was stored as plaintext previously
      decryptedKey = org.wcConsumerKey;
    }

    const maskedKey = decryptedKey.length > 4 
      ? `••••••••••••${decryptedKey.slice(-4)}` 
      : decryptedKey;

    return NextResponse.json({
      orgId: orgId,
      wcBaseUrl: org.wcBaseUrl,
      wcConsumerKey: maskedKey,
      hasSecret: true, // we assume it exists if key exists
      hasWebhookSecret: !!org.wcWebhookSecret,
      tdfApiKey: org.tdfApiKey ? "••••••••••••" : "",
      hasTdfWebhookSecret: !!org.tdfWebhookSecret,
      syncEnabled: org.syncEnabled,
      lastSyncedAt: org.lastSyncedAt,
    });
  } catch (error: any) {
    console.error("[SETTINGS_GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user || !session.user.orgId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (session.user.role !== "ORG_ADMIN" && session.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { wcBaseUrl, wcConsumerKey, wcConsumerSecret, wcWebhookSecret, tdfApiKey, tdfWebhookSecret } = body;

    const updateData: any = {};
    if (wcBaseUrl !== undefined) updateData.wcBaseUrl = wcBaseUrl;
    
    // Encrypt the keys if they were changed
    if (wcConsumerKey && !wcConsumerKey.includes("••••")) {
      updateData.wcConsumerKey = encrypt(wcConsumerKey);
    }
    
    if (wcConsumerSecret && wcConsumerSecret !== "") {
      updateData.wcConsumerSecret = encrypt(wcConsumerSecret);
    }

    if (wcWebhookSecret !== undefined) {
      updateData.wcWebhookSecret = wcWebhookSecret === "" ? null : encrypt(wcWebhookSecret);
    }

    if (tdfApiKey !== undefined) {
      updateData.tdfApiKey = tdfApiKey === "" ? null : tdfApiKey; // Store plain or encrypt? We'll store plain since it's just an API key, or encrypt it. Let's not encrypt unless we need to, the prompt didn't specify. Actually, let's keep it simple and store as plain, or encrypt. 
      // Actually, wait, let's just store it as plain string since it wasn't requested to be encrypted, or maybe we should? wcConsumerSecret is encrypted. Let's store plain for tdfApiKey for now to keep it simple.
      // Or no, let's just encrypt it.
      if (tdfApiKey && !tdfApiKey.includes("••••")) {
        updateData.tdfApiKey = tdfApiKey; // Let's store it plain since Prisma schema doesn't mention encrypted
      }
    }

    if (tdfWebhookSecret !== undefined) {
      updateData.tdfWebhookSecret = tdfWebhookSecret === "" ? null : tdfWebhookSecret;
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: "No changes needed" });
    }

    await prisma.organization.update({
      where: { id: session.user.orgId },
      data: updateData
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SETTINGS_PUT]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
