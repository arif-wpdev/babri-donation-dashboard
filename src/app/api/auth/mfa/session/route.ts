import { ensureSameOrigin, isMfaConfigurationReady } from "@/lib/auth-security";
import { env } from "@/env";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
    const body = await request.json().catch(() => null) as { loginTicket?: unknown; callbackUrl?: unknown } | null;
    if (typeof body?.loginTicket !== "string" || body.loginTicket.length > 128) return Response.json({ error: "Authentication verification is required" }, { status: 400 });
    const requestOrigin = new URL(request.url).origin;
    if (new URL(env.AUTH_APP_ORIGIN!).origin !== requestOrigin) return Response.json({ error: "Invalid request origin" }, { status: 400 });
    if (process.env.NODE_ENV === "production" && !requestOrigin.startsWith("https://")) return Response.json({ error: "Authentication could not be finalized" }, { status: 400 });
    const callback = new URL("/api/auth/callback/credentials", requestOrigin);
    const csrf = await fetch(new URL("/api/auth/csrf", requestOrigin), { headers: { cookie: request.headers.get("cookie") || "" }, cache: "no-store" });
    if (!csrf.ok) return Response.json({ error: "Authentication could not be finalized" }, { status: 503 });
    const csrfBody = await csrf.json().catch(() => null) as { csrfToken?: unknown } | null;
    if (typeof csrfBody?.csrfToken !== "string" || csrfBody.csrfToken.length < 16) return Response.json({ error: "Authentication could not be finalized" }, { status: 503 });
    const csrfToken = csrfBody.csrfToken;
    const csrfCookies = csrf.headers.getSetCookie().map((value) => value.split(";")[0]);
    const incomingCookie = request.headers.get("cookie") || "";
    const cookieValues = new Map<string, string>();
    for (const cookie of [...incomingCookie.split(";"), ...csrfCookies]) {
      const [name, ...parts] = cookie.trim().split("=");
      if (name && parts.length) cookieValues.set(name, parts.join("="));
    }
    const callbackCookies = [...cookieValues.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
    const callbackResponse = await fetch(callback, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", "x-auth-return-redirect": "1", cookie: callbackCookies },
      body: new URLSearchParams({ loginTicket: body.loginTicket, csrfToken, callbackUrl: "/dashboard", json: "true" }),
      cache: "no-store",
      redirect: "manual",
    });
    if (!callbackResponse.ok || callbackResponse.status < 200 || callbackResponse.status >= 300) return Response.json({ error: "Authentication verification expired. Sign in again." }, { status: 401 });
    const callbackResult = await callbackResponse.clone().json().catch(() => null) as { url?: string } | null;
    if (!callbackResult?.url) return Response.json({ error: "Authentication verification expired. Sign in again." }, { status: 401 });
    if (callbackResult.url) {
      const callbackUrl = new URL(callbackResult.url, requestOrigin);
      if (callbackUrl.searchParams.has("error")) return Response.json({ error: "Authentication verification expired. Sign in again." }, { status: 401 });
    }
    const setCookies = callbackResponse.headers.getSetCookie();
    if (!setCookies.some((cookie) => /^(?:__Host-|__Secure-)?authjs\.session-token=/.test(cookie))) return Response.json({ error: "Authentication verification expired. Sign in again." }, { status: 401 });
    const callbackUrl = typeof body.callbackUrl === "string" && body.callbackUrl.startsWith("/") && !body.callbackUrl.startsWith("//") ? body.callbackUrl : "/dashboard";
    const response = Response.json({ success: true, redirectTo: callbackUrl });
    for (const cookie of setCookies) response.headers.append("set-cookie", cookie);
    return response;
  } catch (error) {
    console.error("[AUTH_SESSION] Could not finalize authentication");
    return Response.json({ error: "Authentication could not be finalized" }, { status: 400 });
  }
}
