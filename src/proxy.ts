import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { env } from "@/env";
import { isStrongAuthSession } from "@/lib/auth-session-policy";

const { auth } = NextAuth(authConfig);

// ─────────────────────────────────────────────────────────────────────────────
// Route protection matrix
//
// /login, /register          → Redirect authenticated users to /dashboard
// /dashboard/**              → Any authenticated user
// /super-admin/**            → SUPER_ADMIN only
// /api/orgs POST             → SUPER_ADMIN only
// /api/cron/**               → CRON_SECRET header only (no session required)
// /api/auth/**               → NextAuth public; MFA bootstrap routes public; other MFA routes require strong session
// ─────────────────────────────────────────────────────────────────────────────

export default auth((req: Parameters<typeof auth>[0] extends ((...args: infer A) => unknown) ? A[0] : never) => {
  const { nextUrl, auth: session } = req as NextRequest & { auth: typeof req.auth };
  const pathname = nextUrl.pathname;
  const isAuthenticated = !!session?.user;
  const role = session?.user?.role;
  // Proxy does the cheap signed-cookie check. Route handlers and server layouts
  // perform the authoritative revocation lookup via requireStrongSession().
  const isStrongAuthenticated = isStrongAuthSession(session?.user ?? null, env.AUTH_MFA_ENABLED === "true");

  // ── Cron routes: authenticated by Vercel cron secret ──────────────────────
  if (pathname.startsWith("/api/cron")) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.next();
  }

  // ── NextAuth internal routes: always allow ────────────────────────────────
  if (pathname === "/api/auth" || pathname.startsWith("/api/auth/")) {
    const isMfaBootstrap = pathname === "/api/auth/mfa/password"
      || pathname === "/api/auth/mfa/bootstrap-phone/request"
      || pathname === "/api/auth/mfa/bootstrap-phone/verify"
      || pathname === "/api/auth/mfa/employee-phone/request"
      || pathname === "/api/auth/mfa/employee-phone/verify"
      || pathname === "/api/auth/mfa/employee-phone/passkey-options"
      || pathname === "/api/auth/mfa/employee-phone/passkey-verify"
      || pathname === "/api/auth/mfa/otp/request"
      || pathname === "/api/auth/mfa/otp/verify"
      || pathname === "/api/auth/mfa/passkey/login-options"
      || pathname === "/api/auth/mfa/passkey/login-verify"
      || pathname === "/api/auth/mfa/passkey/fallback"
      || pathname === "/api/auth/mfa/admin-migration"
      || pathname === "/api/auth/mfa/recovery/verify"
      || pathname === "/api/auth/mfa/password-reset/request"
      || pathname === "/api/auth/mfa/password-reset/verify"
      || pathname === "/api/auth/mfa/session";
    if (pathname.startsWith("/api/auth/mfa/mobile-lock/")) {
      if (!isStrongAuthenticated) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      return NextResponse.next();
    }
    if (!pathname.startsWith("/api/auth/mfa/") || isMfaBootstrap || isStrongAuthenticated) return NextResponse.next();
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── Webhook routes: authenticated by signature ────────────────────────────
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  // ── Auth pages: redirect authenticated users ──────────────────────────────
  if (pathname === "/login" || pathname === "/register") {
    if (isStrongAuthenticated) {
      const destination =
        role === "SUPER_ADMIN" ? "/super-admin/organizations" : "/dashboard";
      return NextResponse.redirect(new URL(destination, nextUrl));
    }
    if (isAuthenticated && !isStrongAuthenticated) {
      const response = NextResponse.next();
      response.cookies.delete(process.env.NODE_ENV === "production" ? "__Host-authjs.session-token" : "authjs.session-token");
      return response;
    }
    return NextResponse.next();
  }

  // ── Super Admin routes ────────────────────────────────────────────────────
  if (pathname.startsWith("/super-admin")) {
    if (!isStrongAuthenticated) {
      return NextResponse.redirect(new URL("/login", nextUrl));
    }
    if (role !== "SUPER_ADMIN") {
      return NextResponse.redirect(new URL("/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  // ── Dashboard routes: any authenticated user ──────────────────────────────
  if (pathname.startsWith("/dashboard")) {
    if (!isStrongAuthenticated) {
      const loginUrl = new URL("/login", nextUrl);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return NextResponse.next();
  }

  // ── Protected API routes ──────────────────────────────────────────────────
  if (pathname.startsWith("/api/")) {
    if (!isStrongAuthenticated) {
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
