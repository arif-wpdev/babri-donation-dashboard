import { testOrganizationBackup } from "@/lib/donor-backup";
import { requireAuth } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export async function POST() {
  let user;
  try { user = await requireAuth(); } catch { return Response.json({ error: "Unauthorized or missing organization" }, { status: 401 }); }
  if (!user.orgId) return Response.json({ error: "Unauthorized or missing organization" }, { status: 401 });
  if (user.role !== "SUPER_ADMIN" && user.role !== "ORG_ADMIN") return Response.json({ error: "Forbidden" }, { status: 403 });

  try {
    const result = await testOrganizationBackup(user.orgId);
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Backup provider test failed" }, { status: 400 });
  }
}
