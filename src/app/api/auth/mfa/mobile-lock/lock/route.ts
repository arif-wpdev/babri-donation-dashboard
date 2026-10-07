import { getMobileLockContext, lockMobileSessionNow } from "@/lib/mobile-app-lock";
import { ensureSameOrigin } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    const context = await getMobileLockContext({ allowLockedSession: true });
    if (!context) return Response.json({ enabled: false });
    if (!await lockMobileSessionNow(context)) return Response.json({ error: "Session expired." }, { status: 401 });
    return Response.json({ success: true, locked: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    return Response.json({ error: "Could not lock mobile app." }, { status: 401 });
  }
}