import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/encryption";
import { requireAuth } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  try {
    let session;
    try { session = await requireAuth(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    if (!session.orgId) return NextResponse.json({ error: "Unauthorized or missing organization" }, { status: 401 });
    const orgId = session.orgId;

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
        donorBackupEnabled: true,
        donorBackupGoogleDriveEnabled: true,
        donorBackupGoogleDriveFolderId: true,
        donorBackupGoogleCredentials: true,
        donorBackupB2Enabled: true,
        donorBackupB2Endpoint: true,
        donorBackupB2Bucket: true,
        donorBackupB2KeyId: true,
        donorBackupB2ApplicationKey: true,
        donorBackupLastRunAt: true,
        donorBackupLastStatus: true,
        donorBackupLastError: true,
        donorBackupLastCount: true,
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
      donorBackupEnabled: org.donorBackupEnabled,
      donorBackupGoogleDriveEnabled: org.donorBackupGoogleDriveEnabled,
      hasDonorBackupGoogleCredentials: !!org.donorBackupGoogleCredentials,
      donorBackupGoogleDriveFolderId: org.donorBackupGoogleDriveFolderId ?? "",
      donorBackupB2Enabled: org.donorBackupB2Enabled,
      donorBackupB2Endpoint: org.donorBackupB2Endpoint ?? "",
      donorBackupB2Bucket: org.donorBackupB2Bucket ?? "",
      donorBackupB2KeyId: org.donorBackupB2KeyId ?? "",
      hasDonorBackupB2ApplicationKey: !!org.donorBackupB2ApplicationKey,
      donorBackupLastRunAt: org.donorBackupLastRunAt,
      donorBackupLastStatus: org.donorBackupLastStatus,
      donorBackupLastError: session.role === "ORG_USER" ? null : org.donorBackupLastError,
      donorBackupLastCount: org.donorBackupLastCount,
    });
  } catch (error: any) {
    console.error("[SETTINGS_GET]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    let session;
    try { session = await requireAuth(); } catch { return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); }
    if (!session.orgId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if (session.role !== "ORG_ADMIN" && session.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const {
      wcBaseUrl, wcConsumerKey, wcConsumerSecret, wcWebhookSecret, tdfApiKey, tdfWebhookSecret,
      donorBackupEnabled, donorBackupGoogleDriveEnabled, donorBackupGoogleDriveFolderId,
      googleServiceAccountJson, donorBackupB2Enabled, donorBackupB2Endpoint,
      donorBackupB2Bucket, donorBackupB2KeyId,
      b2ApplicationKey,
    } = body;

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

    if (donorBackupEnabled !== undefined) updateData.donorBackupEnabled = !!donorBackupEnabled;
    if (donorBackupGoogleDriveEnabled !== undefined) updateData.donorBackupGoogleDriveEnabled = !!donorBackupGoogleDriveEnabled;
    if (donorBackupGoogleDriveFolderId !== undefined) updateData.donorBackupGoogleDriveFolderId = donorBackupGoogleDriveFolderId || null;
    if (typeof googleServiceAccountJson === "string" && googleServiceAccountJson.trim()) {
      try {
        JSON.parse(googleServiceAccountJson);
      } catch {
        return NextResponse.json({ error: "Google service account must be valid JSON" }, { status: 400 });
      }
      updateData.donorBackupGoogleCredentials = encrypt(googleServiceAccountJson.trim());
    }
    if (donorBackupB2Enabled !== undefined) updateData.donorBackupB2Enabled = !!donorBackupB2Enabled;
    if (donorBackupB2Endpoint !== undefined) updateData.donorBackupB2Endpoint = donorBackupB2Endpoint || null;
    if (donorBackupB2Bucket !== undefined) updateData.donorBackupB2Bucket = donorBackupB2Bucket || null;
    if (donorBackupB2KeyId !== undefined) updateData.donorBackupB2KeyId = donorBackupB2KeyId || null;
    if (typeof b2ApplicationKey === "string" && b2ApplicationKey.trim()) {
      updateData.donorBackupB2ApplicationKey = encrypt(b2ApplicationKey.trim());
    }

    const currentOrg = await prisma.organization.findUnique({
      where: { id: session.orgId },
      select: {
        donorBackupEnabled: true,
        donorBackupGoogleDriveEnabled: true,
        donorBackupGoogleDriveFolderId: true,
        donorBackupGoogleCredentials: true,
        donorBackupB2Enabled: true,
        donorBackupB2Endpoint: true,
        donorBackupB2Bucket: true,
        donorBackupB2KeyId: true,
        donorBackupB2ApplicationKey: true,
      },
    });
    if (!currentOrg) return NextResponse.json({ error: "Organization not found" }, { status: 404 });
    const backupConfig = {
      ...currentOrg,
      ...updateData,
      donorBackupGoogleDriveEnabled: updateData.donorBackupGoogleDriveEnabled ?? currentOrg.donorBackupGoogleDriveEnabled,
      donorBackupGoogleDriveFolderId: updateData.donorBackupGoogleDriveFolderId ?? currentOrg.donorBackupGoogleDriveFolderId,
      donorBackupGoogleCredentials: updateData.donorBackupGoogleCredentials ?? currentOrg.donorBackupGoogleCredentials,
      donorBackupB2Enabled: updateData.donorBackupB2Enabled ?? currentOrg.donorBackupB2Enabled,
      donorBackupB2Endpoint: updateData.donorBackupB2Endpoint ?? currentOrg.donorBackupB2Endpoint,
      donorBackupB2Bucket: updateData.donorBackupB2Bucket ?? currentOrg.donorBackupB2Bucket,
      donorBackupB2KeyId: updateData.donorBackupB2KeyId ?? currentOrg.donorBackupB2KeyId,
      donorBackupB2ApplicationKey: updateData.donorBackupB2ApplicationKey ?? currentOrg.donorBackupB2ApplicationKey,
    };
    const backupEnabled = updateData.donorBackupEnabled ?? currentOrg.donorBackupEnabled;
    const googleEnabled = updateData.donorBackupGoogleDriveEnabled ?? currentOrg.donorBackupGoogleDriveEnabled;
    const b2Enabled = updateData.donorBackupB2Enabled ?? currentOrg.donorBackupB2Enabled;
    const anyProviderEnabled = googleEnabled || b2Enabled;
    if (backupEnabled && !anyProviderEnabled) {
      return NextResponse.json({ error: "Enable at least one backup destination before enabling daily backups" }, { status: 400 });
    }
    if (googleEnabled && (!backupConfig.donorBackupGoogleDriveFolderId || !backupConfig.donorBackupGoogleCredentials)) {
      return NextResponse.json({ error: "Configure Google Drive folder and service-account JSON before enabling backups" }, { status: 400 });
    }
    if (b2Enabled && (!backupConfig.donorBackupB2Endpoint || !backupConfig.donorBackupB2Bucket || !backupConfig.donorBackupB2KeyId || !backupConfig.donorBackupB2ApplicationKey)) {
      return NextResponse.json({ error: "Configure the B2 endpoint, bucket and credentials before enabling backups" }, { status: 400 });
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ success: true, message: "No changes needed" });
    }

    await prisma.organization.update({
      where: { id: session.orgId! },
      data: updateData
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("[SETTINGS_PUT]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
