import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

// ─────────────────────────────────────────────────────────────────────────────
// Route protection matrix
//
// /login, /register          → Redirect authenticated users to /dashboard
// /dashboard/**              → Any authenticated user
// /super-admin/**            → SUPER_ADMIN only
// /api/orgs POST             → SUPER_ADMIN only
// /api/cron/**               → CRON_SECRET header only (no session required)
// /api/auth/**               → Always public (NextAuth handlers)
// ─────────────────────────────────────────────────────────────────────────────

export default auth((req: Parameters<typeof auth>[0] extends ((...args: infer A) => unknown) ? A[0] : never) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: typeof req.auth };
  const pathname = nextUrl.pathname;
  const isAuthenticated = !!session?.user;
  const role = session?.user?.role;

  // ── Cron routes: authenticated by secret header only ──────────────────────
  if (pathname.startsWith("/api/cron")) {
    const cronSecret = req.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── NextAuth internal routes: always allow ────────────────────────────────
  if (pathname.startsWith("/api/auth")) {
    return NextResponse.next();
  }

  // ── Auth pages: redirect authenticated users ──────────────────────────────
  if (pathname === "/login" || pathname === "/register") {
    if (isAuthenticated) {
      const destination =
        role === "SUPER_ADMIN" ? "/super-admin/organizations" : "/dashboard";
      return NextResponse.redirect(new URL(destination, nextUrl));
    }
    return NextResponse.next();
  }

  // ── Super Admin routes ────────────────────────────────────────────────────
  if (pathname.startsWith("/super-admin")) {
    if (!isAuthenticated) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  // ── Dashboard routes: any authenticated user ──────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    if (!isAuthenticated) {
      const loginUrl = new URL("/login", nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── Protected API routes ──────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    if (!isAuthenticated) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  return NextResponse.next();
});

export const config = {
  /**
   * Match all routes except static files, images, and favicon.
   * This ensures the middleware runs for all dynamic paths.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
