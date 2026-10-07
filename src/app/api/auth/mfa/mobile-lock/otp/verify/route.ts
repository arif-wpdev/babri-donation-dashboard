import { prisma } from "@/lib/prisma";
import { canUnlockMobileAppWithOtp } from "@/lib/auth-session-policy";
import { clearMobileLockUnlockPreAuth, getMobileLockContext, getMobileLockState, getMobileLockUnlockPreAuth } from "@/lib/mobile-app-lock";
import { ensureSameOrigin, enforceRateLimits, hashAuthValue, nextOtpFailure, OTP_LOCK_DURATION_MS, OTP_MAX_FAILED_ATTEMPTS, requestIp, verifyOtpHash, writeSecurityEvent } from "@/lib/auth-security";

export async function POST(request: Request) {
	try {
		ensureSameOrigin(request);
		const context = await getMobileLockContext({ allowLockedSession: true });
		const preAuth = context ? await getMobileLockUnlockPreAuth(context.userId) : null;
		if (!context || !preAuth || !(await getMobileLockState())?.locked) return Response.json({ error: "Unlock attempt expired. Request another code." }, { status: 401 });
		const body = await request.json().catch(() => null) as { otp?: unknown } | null;
		if (!body || typeof body.otp !== "string" || !/^\d{6}$/.test(body.otp)) return Response.json({ error: "Enter the six-digit code." }, { status: 400 });
		const ip = requestIp(request.headers);
		const rate = await enforceRateLimits([
			{ key: `mobile-unlock-otp-verify-user:${context.userId}`, limit: 10, windowMs: 24 * 60 * 60_000, blockMs: OTP_LOCK_DURATION_MS },
			{ key: `mobile-unlock-otp-verify-ip:${hashAuthValue(ip, "ip")}`, limit: 25, windowMs: 24 * 60 * 60_000, blockMs: OTP_LOCK_DURATION_MS },
		]);
		if (!rate.allowed) return Response.json({ error: "Unlock verification is temporarily unavailable." }, { status: 429, headers: { "Retry-After": String(rate.retryAfterSeconds) } });

		const identifierHash = hashAuthValue(context.sessionId, "mobile-app-unlock-otp");
		const now = new Date();
		const challenge = await prisma.authChallenge.findUnique({ where: { identifierHash_type: { identifierHash, type: "PHONE_VERIFICATION" } } });
		if (!challenge || challenge.userId !== context.userId || challenge.purpose !== context.sessionId || challenge.loginTicketHash !== preAuth.tokenHash || !challenge.loginTicketExpiresAt || challenge.loginTicketExpiresAt <= now || challenge.deliveryChannel !== "mobile-app-unlock" || !challenge.otpHash || !challenge.otpExpiresAt || challenge.otpExpiresAt <= now || challenge.consumedAt || challenge.failedAttempts >= OTP_MAX_FAILED_ATTEMPTS || (challenge.lockedUntil && challenge.lockedUntil > now)) {
			return Response.json({ error: "Code is invalid or expired." }, { status: 400 });
		}
		if (!verifyOtpHash(challenge.otpHash, body.otp)) {
			const failure = await prisma.$transaction(async (tx) => {
				const current = await tx.authChallenge.findUnique({ where: { id: challenge.id } });
				if (!current || current.userId !== context.userId || current.purpose !== context.sessionId || current.loginTicketHash !== preAuth.tokenHash || current.loginTicketExpiresAt === null || current.loginTicketExpiresAt <= now || current.otpHash !== challenge.otpHash || current.consumedAt || !current.otpExpiresAt || current.otpExpiresAt <= now || current.failedAttempts !== challenge.failedAttempts) return null;
				const next = nextOtpFailure(current.failedAttempts, now, OTP_MAX_FAILED_ATTEMPTS, OTP_LOCK_DURATION_MS);
				const update = await tx.authChallenge.updateMany({ where: { id: current.id, userId: context.userId, purpose: context.sessionId, deliveryChannel: "mobile-app-unlock", loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: { gt: now }, otpHash: challenge.otpHash, failedAttempts: current.failedAttempts, consumedAt: null }, data: { failedAttempts: next.attempts, ...(next.lockedUntil && { lockedUntil: next.lockedUntil, otpHash: null }) } });
				return update.count === 1 ? next : null;
			}, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
			if (!failure) return Response.json({ error: "Unlock code state changed." }, { status: 409 });
			await writeSecurityEvent({ userId: context.userId, eventType: failure.lockedUntil ? "OTP_LOCK" : "OTP_FAILURE", ip, userAgent: request.headers.get("user-agent"), details: { purpose: "mobile_app_unlock", attempts: failure.attempts } });
			return Response.json({ error: failure.lockedUntil ? "Too many incorrect codes. Unlock is temporarily locked." : "Incorrect code.", attemptsRemaining: Math.max(0, OTP_MAX_FAILED_ATTEMPTS - failure.attempts) }, { status: failure.lockedUntil ? 429 : 400 });
		}

		const unlocked = await prisma.$transaction(async (tx) => {
			const currentSession = await tx.authSession.findUnique({
				where: { id: context.sessionId },
				include: {
					user: {
						select: {
							id: true,
							role: true,
							phoneVerifiedAt: true,
							phone: true,
							orgId: true,
							org: { select: { deletedAt: true } },
						},
					},
				},
			});
			const sessionEligible = canUnlockMobileAppWithOtp({ role: currentSession?.user.role ?? "", phoneVerifiedAt: currentSession?.user.phoneVerifiedAt ?? null, organizationActive: Boolean(currentSession?.user.orgId) && !currentSession?.user.org?.deletedAt, currentSessionId: context.sessionId, suppliedSessionId: currentSession?.id ?? null, sessionMobileLockEnabled: currentSession?.mobileLockEnabled ?? false, sessionRevokedAt: currentSession?.revokedAt ?? null, sessionExpiresAt: currentSession?.expiresAt ?? null, lastUsedAt: currentSession?.lastUsedAt ?? now, now });
			if (!currentSession || currentSession.userId !== context.userId || currentSession.user.phone !== context.phone || !sessionEligible) return false;
			const claimed = await tx.authChallenge.updateMany({ where: { id: challenge.id, userId: context.userId, purpose: context.sessionId, loginTicketHash: preAuth.tokenHash, loginTicketExpiresAt: { gt: now }, deliveryChannel: "mobile-app-unlock", otpHash: challenge.otpHash, consumedAt: null, otpExpiresAt: { gt: now }, failedAttempts: { lt: OTP_MAX_FAILED_ATTEMPTS }, lockedUntil: null }, data: { consumedAt: now, verifiedAt: now, otpHash: null, loginTicketHash: null, loginTicketExpiresAt: null } });
			if (claimed.count !== 1) return false;
			const preAuthConsumed = await tx.loginPreAuth.updateMany({ where: { id: preAuth.id, userId: context.userId, tokenHash: preAuth.tokenHash, deliveryChannel: "mobile-unlock", passkeyOnly: true, consumedAt: null, expiresAt: { gt: now } }, data: { consumedAt: now } });
			if (preAuthConsumed.count !== 1) return false;
			const updated = await tx.authSession.updateMany({ where: { id: context.sessionId, userId: context.userId, mobileLockEnabled: true, revokedAt: null, expiresAt: { gt: now }, lastUsedAt: currentSession.lastUsedAt }, data: { lastUsedAt: now } });
			return updated.count === 1;
		}, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 8_000 });
		if (!unlocked) return Response.json({ error: "Session changed. Request a new unlock code." }, { status: 409 });
		await clearMobileLockUnlockPreAuth();
		await writeSecurityEvent({ userId: context.userId, eventType: "LOGIN_SUCCESS", ip, userAgent: request.headers.get("user-agent"), details: { method: "mobile_app_lock_otp_unlock" } });
		return Response.json({ success: true, unlocked: true });
	} catch (error) {
		if (error instanceof Error && error.message === "Invalid request origin") return Response.json({ error: "Invalid request" }, { status: 400 });
		console.error("[MOBILE_LOCK_OTP_VERIFY] Unlock failed");
		return Response.json({ error: "Mobile unlock could not be completed." }, { status: 400 });
	}
}
