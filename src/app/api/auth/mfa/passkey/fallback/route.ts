import { prisma } from "@/lib/prisma";
import { canEmployeeFallbackToOtp } from "@/lib/auth-session-policy";
import { ensureSameOrigin, enforceRateLimits, getPreAuthUser, isMfaConfigurationReady, requestIp, rotateEmployeePasskeyPreAuthToOtp, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
  try {
    ensureSameOrigin(request);
    if (!isMfaConfigurationReady()) return Response.json({ error: "Sign-in is temporarily unavailable." }, { status: 503 });
    const preAuth = await getPreAuthUser();
    if (!preAuth) return Response.json({ error: "Sign-in attempt expired. Enter your phone number again." }, { status: 401 });
    const ip = requestIp(request.headers);
    const rate = await enforceRateLimits([
      { key: `employee-passkey-fallback:${preAuth.user.id}`, limit: 5, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
      { key: `employee-passkey-fallback-ip:${ip}`, limit: 15, windowMs: 60 * 60_000, blockMs: 60 * 60_000 },
    ]);
    if (!rate.allowed) return Response.json({ error: "OTP fallback is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

    const organization = preAuth.user.orgId
      ? await prisma.organization.findUnique({ where: { id: preAuth.user.orgId }, select: { deletedAt: true } })
      : null;
    if (!canEmployeeFallbackToOtp({
      role: preAuth.user.role,
      phoneVerifiedAt: preAuth.user.phoneVerifiedAt,
      organizationActive: Boolean(preAuth.user.orgId) && Boolean(organization) && !organization?.deletedAt,
      preAuthPasskeyOnly: preAuth.preAuth.passkeyOnly,
      deliveryChannel: preAuth.preAuth.deliveryChannel,
    })) return Response.json({ error: "OTP fallback is unavailable. Restart sign-in." }, { status: 403 });

    await rotateEmployeePasskeyPreAuthToOtp({ userId: preAuth.user.id, preAuthId: preAuth.preAuth.id, preAuthTokenHash: preAuth.preAuth.tokenHash });
    await writeSecurityEvent({ userId: preAuth.user.id, eventType: "SUSPICIOUS_ACTIVITY", ip, userAgent: request.headers.get("user-agent"), details: { action: "employee_passkey_otp_fallback" } });
    return Response.json({ success: true, next: "otp", message: "A verification code can now be sent to your registered phone." });
  } catch (error) {
    if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
    console.error("[AUTH_PASSKEY_FALLBACK] Employee OTP fallback failed");
    return Response.json({ error: "OTP fallback could not be started. Restart sign-in." }, { status: 400 });
  }
}