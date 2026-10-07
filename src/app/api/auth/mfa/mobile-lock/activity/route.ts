import { getMobileLockContext, markMobileLockActivity } from "@/lib/mobile-app-lock";
import { ensureSameOrigin } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const context = await getMobileLockContext({ allowLockedSession: true });
    if (!context) return Response.json({ enabled: false });
    const active = await markMobileLockActivity(context);
    if (!active) return Response.json({ error: "Mobile app is locked. Unlock to continue." }, { status: 423 });
    return Response.json({ success: true, lastActivityAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: "Could not update mobile app activity." }, { status: 401 });
  }
}