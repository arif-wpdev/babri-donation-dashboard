import { createDailyDonorBackups } from "@/lib/donor-backup";
import { requireAuth } from "@/lib/rbac";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  let user;
  try { user = await requireAuth(); } catch { return Response.json({ error: "Unauthorized or missing organization" }, { status: 401 }); }
  if (!user.orgId) return Response.json({ error: "Unauthorized or missing organization" }, { status: 401 });
  if (user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await createDailyDonorBackups(user.orgId, true);
    const organization = result.organizations[0];
    if (!organization) return Response.json({ error: "No backup was produced" }, { status: 400 });
    if ("success" in organization && organization.success === false) {
      if (organization.status === "PARTIAL") {
        return Response.json({
          success: false,
          status: organization.status,
          donorCount: organization.donorCount,
          uploadedTo: organization.uploadedTo,
          error: organization.error,
        });
      }
      return Response.json({ error: organization.error }, { status: 502 });
    }
    return Response.json({ success: true, donorCount: organization.donorCount, uploadedTo: organization.uploadedTo });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backup failed" }, { status: 500 });
  }
}
