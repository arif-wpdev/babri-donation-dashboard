import { createHash } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import { google } from "googleapis";
import { S3Client, PutObjectCommand, HeadBucketCommand } from "@aws-sdk/client-s3";
import { prisma } from "@/lib/prisma";
import { decrypt } from "@/lib/encryption";
import { donorToBackupRow, makeDonorBackupCsv, makeDonorBackupXlsx } from "@/lib/donor-backup-format";

const GOOGLE_SHEET_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const GOOGLE_CSV_MIME = "text/csv";
const B2_XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const TIME_ZONE = "Asia/Dhaka";
const EXCEL_ROW_LIMIT = 1_048_576;
type BackupDonor = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  normalizedPhone: string | null;
  totalSpent: unknown;
  ordersCount: number;
  wcDateCreated: Date | null;
  lastDonationAt: Date | null;
  donations: Array<{
    wcDatePaid: Date | null;
    wcDateCreated: Date | null;
    utmSource: string | null;
    utmCampaign: string | null;
    fund: { name: string } | null;
  }>;
};

function dateInDhaka(value: Date | null) {
  return value ? formatInTimeZone(value, TIME_ZONE, "d MMM, yy") : "-";
}

async function getAllDonors(orgId: string): Promise<BackupDonor[]> {
  const pageSize = 500;
  const donors: BackupDonor[] = [];
  let skip = 0;

  while (true) {
    const page = await prisma.donor.findMany({
      where: { orgId },
      orderBy: { id: "asc" },
      skip,
      take: pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        normalizedPhone: true,
        totalSpent: true,
        ordersCount: true,
        wcDateCreated: true,
        lastDonationAt: true,
        donations: {
          where: { status: "COMPLETED" },
          orderBy: [{ wcDatePaid: "desc" }, { wcDateCreated: "desc" }],
          take: 1,
          select: {
            wcDatePaid: true,
            wcDateCreated: true,
            utmSource: true,
            utmCampaign: true,
            fund: { select: { name: true } },
          },
        },
      },
    });

    donors.push(...page);
    if (donors.length + pageSize > EXCEL_ROW_LIMIT) {
      throw new Error("Donor backup exceeds Excel's maximum worksheet row limit.");
    }
    if (page.length < pageSize) break;
    skip += page.length;
  }

  return donors;
}

function safeFilePart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "organization";
}

async function getDriveClient(accountJson: string, folderId: string) {
  if (!accountJson || !folderId) {
    throw new Error("Google Drive backup needs service-account JSON and a target folder ID.");
  }

  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(accountJson) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON must be valid service-account JSON.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  const drive = google.drive({ version: "v3", auth });
  const folder = await drive.files.get({
    fileId: folderId,
    fields: "id,name,mimeType,capabilities(canAddChildren)",
    supportsAllDrives: true,
  });
  if (folder.data.mimeType !== "application/vnd.google-apps.folder" || !folder.data.capabilities?.canAddChildren) {
    throw new Error("The configured Google Drive target must be a folder writable by the service account.");
  }
  return { drive, folderId };
}

async function uploadB2Object(client: S3Client, bucket: string, key: string, content: Buffer | string, contentType: string) {
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8"),
    ContentType: contentType,
  }));
}

async function uploadOrReplace(
  drive: Awaited<ReturnType<typeof google.drive>>,
  folderId: string,
  fileName: string,
  mimeType: string,
  content: Buffer | string,
) {
  const queryName = fileName.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  const existing = await drive.files.list({
    q: `'${folderId}' in parents and name = '${queryName}' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 5,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });
  const existingId = existing.data.files?.[0]?.id;
  const media = { mimeType, body: Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8") };

  if (existingId) {
    await drive.files.update({
      fileId: existingId,
      media,
      fields: "id,name,webViewLink",
      supportsAllDrives: true,
    });
    return existingId;
  }

  const created = await drive.files.create({
    requestBody: { name: fileName, parents: [folderId] },
    media,
    fields: "id,name,webViewLink",
    supportsAllDrives: true,
  });
  if (!created.data.id) throw new Error(`Google Drive did not return a file ID for ${fileName}`);
  return created.data.id;
}

export async function createDailyDonorBackups(onlyOrgId?: string, manual = false) {
  const today = formatInTimeZone(new Date(), TIME_ZONE, "yyyy-MM-dd");
  const organizations = await prisma.organization.findMany({
    where: {
      deletedAt: null,
      ...(manual ? {} : { donorBackupEnabled: true }),
      ...(onlyOrgId && { id: onlyOrgId }),
      OR: [
        { donorBackupGoogleDriveEnabled: true },
        { donorBackupB2Enabled: true },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      donorBackupGoogleDriveEnabled: true,
      donorBackupGoogleDriveFolderId: true,
      donorBackupGoogleCredentials: true,
      donorBackupB2Enabled: true,
      donorBackupB2Endpoint: true,
      donorBackupB2Bucket: true,
      donorBackupB2KeyId: true,
      donorBackupB2ApplicationKey: true,
    },
    orderBy: { name: "asc" },
  });
  const results = [];

  for (const organization of organizations) {
    const startedAt = new Date();
    try {
      const donors = await getAllDonors(organization.id);
      const rows = donors.map((donor) => donorToBackupRow(donor, dateInDhaka));
      const orgName = safeFilePart(organization.slug || organization.name);
      const baseName = `${orgName}-donors-${today}`;
      const xlsx = makeDonorBackupXlsx(rows);
      const csv = makeDonorBackupCsv(rows);

      if (xlsx.byteLength > 20 * 1024 * 1024 || Buffer.byteLength(csv, "utf8") > 20 * 1024 * 1024) {
        throw new Error(`Donor backup for ${organization.name} exceeds the 20 MB provider upload limit.`);
      }

      const uploadedTo: string[] = [];
      const providerErrors: string[] = [];
      if (organization.donorBackupGoogleDriveEnabled) {
        try {
          if (!organization.donorBackupGoogleCredentials || !organization.donorBackupGoogleDriveFolderId) {
            throw new Error("Google Drive is enabled but its folder or service account is missing.");
          }
          const credentials = decrypt(organization.donorBackupGoogleCredentials);
          const { drive, folderId } = await getDriveClient(credentials, organization.donorBackupGoogleDriveFolderId);
          const [xlsxId, csvId] = await Promise.all([
            uploadOrReplace(drive, folderId, `${baseName}.xlsx`, GOOGLE_SHEET_MIME, xlsx),
            uploadOrReplace(drive, folderId, `${baseName}.csv`, GOOGLE_CSV_MIME, csv),
          ]);
          uploadedTo.push(`Google Drive (${xlsxId}, ${csvId})`);
        } catch (error) {
          providerErrors.push(`Google Drive: ${error instanceof Error ? error.message : "Upload failed"}`);
        }
      }

      if (organization.donorBackupB2Enabled) {
        let client: S3Client | undefined;
        try {
          const endpoint = organization.donorBackupB2Endpoint;
          const bucket = organization.donorBackupB2Bucket;
          const keyId = organization.donorBackupB2KeyId;
          const encryptedKey = organization.donorBackupB2ApplicationKey;
          if (!endpoint || !bucket || !keyId || !encryptedKey) {
            throw new Error("Backblaze B2 is enabled but its endpoint, bucket or credentials are missing.");
          }
          client = new S3Client({
            region: "us-east-1",
            endpoint,
            forcePathStyle: true,
            credentials: { accessKeyId: keyId, secretAccessKey: decrypt(encryptedKey) },
          });
          await client.send(new HeadBucketCommand({ Bucket: bucket }));
          const prefix = `${orgName}/${today}`;
          await Promise.all([
            uploadB2Object(client, bucket, `${prefix}/${baseName}.xlsx`, xlsx, B2_XLSX_MIME),
            uploadB2Object(client, bucket, `${prefix}/${baseName}.csv`, csv, GOOGLE_CSV_MIME),
          ]);
          uploadedTo.push("Backblaze B2");
        } catch (error) {
          providerErrors.push(`Backblaze B2: ${error instanceof Error ? error.message : "Upload failed"}`);
        } finally {
          client?.destroy();
        }
      }

      const status = providerErrors.length === 0 ? "SUCCESS" : uploadedTo.length > 0 ? "PARTIAL" : "FAILED";
      const errorMessage = providerErrors.length ? providerErrors.join("; ").slice(0, 2000) : null;
      await prisma.organization.update({
        where: { id: organization.id },
        data: { donorBackupLastRunAt: new Date(), donorBackupLastStatus: status, donorBackupLastError: errorMessage, donorBackupLastCount: rows.length },
      });
      results.push({ orgId: organization.id, organization: organization.name, success: status === "SUCCESS", status, donorCount: rows.length, uploadedTo, ...(errorMessage && { error: errorMessage }) });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 2000) : "Donor backup failed";
      await prisma.organization.update({
        where: { id: organization.id },
        data: { donorBackupLastRunAt: new Date(), donorBackupLastStatus: "FAILED", donorBackupLastError: message },
      });
      results.push({ orgId: organization.id, organization: organization.name, success: false, status: "FAILED", donorCount: 0, uploadedTo: [], error: message });
      console.error(`[DONOR BACKUP] Failed for organization ${organization.id} after ${Date.now() - startedAt.getTime()}ms`, message);
    }
  }

  return { date: today, timeZone: TIME_ZONE, organizations: results };
}

export async function testOrganizationBackup(orgId: string) {
  const organization = await prisma.organization.findFirst({
    where: { id: orgId, deletedAt: null },
    select: {
      id: true,
      name: true,
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
  if (!organization) throw new Error("Organization not found");

  const results: Array<{ provider: string; success: boolean; error?: string }> = [];
  if (organization.donorBackupGoogleDriveEnabled) {
    try {
      if (!organization.donorBackupGoogleCredentials || !organization.donorBackupGoogleDriveFolderId) throw new Error("Google Drive folder or service account is missing");
      await getDriveClient(decrypt(organization.donorBackupGoogleCredentials), organization.donorBackupGoogleDriveFolderId);
      results.push({ provider: "Google Drive", success: true });
    } catch (error) {
      results.push({ provider: "Google Drive", success: false, error: error instanceof Error ? error.message : "Drive test failed" });
    }
  }

  if (organization.donorBackupB2Enabled) {
    let client: S3Client | undefined;
    try {
      const { donorBackupB2Endpoint, donorBackupB2Bucket, donorBackupB2KeyId, donorBackupB2ApplicationKey } = organization;
      if (!donorBackupB2Endpoint || !donorBackupB2Bucket || !donorBackupB2KeyId || !donorBackupB2ApplicationKey) throw new Error("B2 endpoint, bucket or credentials are missing");
      client = new S3Client({
        region: "us-east-1",
        endpoint: donorBackupB2Endpoint,
        forcePathStyle: true,
        credentials: { accessKeyId: donorBackupB2KeyId, secretAccessKey: decrypt(donorBackupB2ApplicationKey) },
      });
      await client.send(new HeadBucketCommand({ Bucket: donorBackupB2Bucket }));
      results.push({ provider: "Backblaze B2", success: true });
    } catch (error) {
      results.push({ provider: "Backblaze B2", success: false, error: error instanceof Error ? error.message : "B2 test failed" });
    } finally {
      client?.destroy();
    }
  }

  if (!results.length) throw new Error("Enable and configure at least one backup provider first");
  return { organization: organization.name, providers: results, success: results.every((item) => item.success) };
}
