import { createDailyDonorBackups } from "@/lib/donor-backup";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/donors-backup
 * Vercel Cron invokes this daily. src/proxy.ts authenticates /api/cron/* with
 * the CRON_SECRET bearer token before the request reaches this handler.
 */
export async function GET() {
  try {
    const result = await createDailyDonorBackups();
    console.info("[CRON] Daily donor backups completed", result);
    return Response.json({ success: true, ...result });
  } catch (error) {
    console.error("[CRON] Daily donor backup failed", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Daily donor backup failed" },
      { status: 500 },
    );
  }
}
