import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { clearPreAuth, ensureSameOrigin, requestIp, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    await clearPreAuth();
    const session = await auth();
    if (session?.user) {
      if (session.user.authSessionId) {
        await prisma.authSession.updateMany({ where: { id: session.user.authSessionId, userId: session.user.id, revokedAt: null }, data: { revokedAt: new Date() } });
      }
      await writeSecurityEvent({ userId: session.user.id, eventType: "LOGOUT", ip: requestIp(request.headers), userAgent: request.headers.get("user-agent"), details: { hadServerSession: Boolean(session.user.authSessionId) } });
    }
    const signedOut = await signOut({ redirect: false, redirectTo: "/login" });
    const response = Response.json({ success: true });
    for (const cookie of signedOut.headers.getSetCookie()) response.headers.append("set-cookie", cookie);
    return response;
  } catch {
    console.error("[AUTH_LOGOUT] Logout failed");
    return Response.json({ error: "Could not complete logout" }, { status: 400 });
  }
}
