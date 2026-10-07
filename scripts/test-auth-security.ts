import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

process.env.SKIP_ENV_VALIDATION = "true";
process.env.AUTH_SECRET ||= randomBytes(32).toString("base64url");
process.env.AUTH_OTP_HASH_KEY ||= randomBytes(32).toString("hex");
process.env.AUTH_RATE_LIMIT_HMAC_KEY ||= randomBytes(32).toString("hex");


void Promise.all([
	import("../src/lib/auth-security"),
	import("../src/lib/auth-session-policy"),
	import("../src/lib/greenweb-sms"),
	import("../src/lib/donor-date-filter"),
]).then(([{
	verifyOtpHash,
	hashAuthValue,
	normalizeIdentifier,
	randomOtp,
	OTP_VALIDITY_MS,
	OTP_RESEND_INTERVAL_MS,
	OTP_MAX_FAILED_ATTEMPTS,
	OTP_LOCK_DURATION_MS,
	getOtpRequestBlock,
	isOtpChallengeUsable,
	isWebAuthnConfigurationReady,
	nextOtpFailure,
	evaluateRateLimit,
	isPasskeyChallengeUsable,
	isCredentialTrustedForUser,
	prefersMobileAuthFlow,
sanitizeSecurityEventDetails,
	}, { isStrongAuthSession, isActiveSessionRecord, isLoginTicketCurrent, clearExpiredOtpLock, canBootstrapSuperAdminPhone, isValidWebAuthnOriginConfig }, { isGreenwebSmsAccepted }, { getDonorDonationDateBounds, matchesPeriodDonationFilters }]) => {
	const otp = randomOtp();
	assert.match(otp, /^\d{6}$/);
	assert.equal(verifyOtpHash(hashAuthValue(otp, "otp"), otp), true);
	const wrongOtp = `${(Number(otp[0]) + 1) % 10}${otp.slice(1)}`;
	assert.equal(verifyOtpHash(hashAuthValue(otp, "otp"), wrongOtp), false);
	assert.equal(normalizeIdentifier("008801234567890"), "+8801234567890");
	assert.equal(normalizeIdentifier("+880 1234-567890"), "+8801234567890");
	assert.equal(normalizeIdentifier("01521434555"), "+8801521434555", "Bangladesh local phone should be accepted and canonicalized");
	assert.equal(normalizeIdentifier("+8801521434555"), "+8801521434555", "international phone should remain canonical");
	assert.equal(normalizeIdentifier("8801521434555"), "+8801521434555", "880-prefixed phone should canonicalize to E.164");

	const otpHash = hashAuthValue(otp, "otp");
	assert.notEqual(otpHash, otp);
	assert.equal(hashAuthValue("same-value", "account"), hashAuthValue("same-value", "account"));
	assert.notEqual(hashAuthValue("same-value", "account"), hashAuthValue("same-value", "ip"));

	const now = new Date("2026-10-07T12:00:00.000Z");
	assert.equal(OTP_VALIDITY_MS, 5 * 60_000);
	assert.equal(OTP_RESEND_INTERVAL_MS, 60_000);
	assert.equal(OTP_MAX_FAILED_ATTEMPTS, 3);
	assert.equal(OTP_LOCK_DURATION_MS, 24 * 60 * 60_000);

	const usableChallenge = {
		otpHash: hashAuthValue(otp, "otp"),
		otpExpiresAt: new Date(now.getTime() + OTP_VALIDITY_MS),
		consumedAt: null,
		lockedUntil: null,
		failedAttempts: 0,
		resendAfter: new Date(now.getTime() + OTP_RESEND_INTERVAL_MS),
	};
	assert.equal(isOtpChallengeUsable(usableChallenge, now), true, "correct current OTP challenge should be usable");
	assert.equal(isOtpChallengeUsable({ ...usableChallenge, otpExpiresAt: now }, now), false, "expired OTP must fail");
	assert.equal(isOtpChallengeUsable({ ...usableChallenge, consumedAt: now }, now), false, "used OTP must not be reusable");
	assert.equal(isOtpChallengeUsable({ ...usableChallenge, lockedUntil: new Date(now.getTime() + 1) }, now), false, "locked OTP must fail");
	assert.equal(isOtpChallengeUsable({ ...usableChallenge, failedAttempts: 3 }, now), false, "three failed attempts must disable the challenge");

	const previousCode = "000000";
	const replacementCode = "000001";
	const previousHash = hashAuthValue(previousCode, "otp");
	const replacementHash = hashAuthValue(replacementCode, "otp");
	assert.notEqual(replacementHash, previousHash, "a newly generated OTP hash replaces the previous OTP hash");
	assert.equal(verifyOtpHash(replacementHash, previousCode), false, "the previous OTP must not match a replacement hash");
	assert.equal(verifyOtpHash(replacementHash, replacementCode), true, "the replacement OTP must match the replacement hash");

	assert.deepEqual(getOtpRequestBlock({ resendAfter: new Date(now.getTime() + 60_000), lockedUntil: null }, now), { reason: "resend", retryAfterSeconds: 60 });
	assert.deepEqual(getOtpRequestBlock({ resendAfter: null, lockedUntil: new Date(now.getTime() + OTP_LOCK_DURATION_MS) }, now), { reason: "locked", retryAfterSeconds: 86400 });
	assert.equal(getOtpRequestBlock({ resendAfter: now, lockedUntil: now }, now), null, "expired resend and lock timers should permit a new challenge");

	const firstFailure = nextOtpFailure(0, now);
	assert.equal(firstFailure.attempts, 1);
	assert.equal(firstFailure.lockedUntil, null);
	const thirdFailure = nextOtpFailure(2, now);
	assert.equal(thirdFailure.attempts, 3);
	assert.equal(thirdFailure.lockedUntil?.getTime(), now.getTime() + OTP_LOCK_DURATION_MS);

	const rateWindowEnds = new Date(now.getTime() + 60_000);
	assert.deepEqual(evaluateRateLimit({ count: 0, windowEnds: now, now, limit: 2, windowMs: 60_000 }), {
		allowed: true,
		count: 1,
		windowEnds: new Date(now.getTime() + 60_000),
		blockedUntil: null,
		retryAfterSeconds: 0,
	});
	assert.equal(evaluateRateLimit({ count: 2, windowEnds: rateWindowEnds, now, limit: 2, windowMs: 60_000 }).allowed, false, "request over the rate limit must be blocked");
	assert.equal(evaluateRateLimit({ count: 1, windowEnds: rateWindowEnds, blockedUntil: new Date(now.getTime() + 30_000), now, limit: 5, windowMs: 60_000 }).retryAfterSeconds, 30, "active rate-limit block must remain in force");
	assert.equal(evaluateRateLimit({ count: 5, windowEnds: now, blockedUntil: null, now, limit: 2, windowMs: 60_000 }).count, 1, "expired rate window must reset its counter");

	const passkeyChallenge = { userId: "user-1", challenge: "challenge-value", otpExpiresAt: new Date(now.getTime() + 60_000), consumedAt: null };
	assert.equal(isPasskeyChallengeUsable(passkeyChallenge, "user-1", now), true, "current user's active WebAuthn challenge should be usable");
	assert.equal(isPasskeyChallengeUsable(passkeyChallenge, "user-2", now), false, "challenge must not be transferable between users");
	assert.equal(isPasskeyChallengeUsable({ ...passkeyChallenge, otpExpiresAt: now }, "user-1", now), false, "expired WebAuthn challenge must fail");
	assert.equal(isPasskeyChallengeUsable({ ...passkeyChallenge, consumedAt: now }, "user-1", now), false, "used WebAuthn challenge must not be reusable");

	const credentialBinding = {
		userId: "user-1",
		credentialId: "credential-1",
		credentialUserId: "user-1",
		trustedCredentialId: "credential-1",
		credentialRevokedAt: null,
		trustedDeviceRevokedAt: null,
	};
	assert.equal(isCredentialTrustedForUser(credentialBinding), true, "active credential tied to the trusted device should pass binding check");
	assert.equal(isCredentialTrustedForUser({ ...credentialBinding, credentialRevokedAt: now }), false, "revoked passkey must not authenticate");
	assert.equal(isCredentialTrustedForUser({ ...credentialBinding, trustedDeviceRevokedAt: now }), false, "revoked trusted-device record must not authenticate");
	assert.equal(isCredentialTrustedForUser({ ...credentialBinding, credentialUserId: "user-2" }), false, "credential ownership must match pre-auth user");
	assert.equal(isCredentialTrustedForUser({ ...credentialBinding, trustedCredentialId: "credential-2" }), false, "credential ID must match the trusted device binding");
	assert.equal(prefersMobileAuthFlow(new Headers({ "sec-ch-ua-mobile": "?1" })), true, "mobile client hint should select the mobile auth UX");
	assert.equal(prefersMobileAuthFlow(new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" })), true, "iOS Safari should select mobile UX without client hints");
	assert.equal(prefersMobileAuthFlow(new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36" })), false, "desktop browser should not be classified as mobile by UX hint");

	assert.equal(isStrongAuthSession(null, true), false, "missing session must not be authenticated");
	assert.equal(isStrongAuthSession({ authSessionId: null, mfaVerifiedAt: null }, true), false, "password-only JWT must fail when MFA is enabled");
	assert.equal(isStrongAuthSession({ authSessionId: "session-1", mfaVerifiedAt: null }, true), false, "session without MFA proof must fail when MFA is enabled");
	assert.equal(isStrongAuthSession({ authSessionId: "session-1", mfaVerifiedAt: Date.now() }, true), true, "MFA-authenticated session should pass the signed-claim gate");
	assert.equal(isStrongAuthSession({ authSessionId: null, mfaVerifiedAt: null }, false), true, "legacy sessions remain usable only while MFA rollout is disabled");
	assert.equal(isActiveSessionRecord({ userId: "user-1", expiresAt: new Date(now.getTime() + 1), revokedAt: null }, "user-1", now), true, "unrevoked, unexpired server session should be active");
	assert.equal(isActiveSessionRecord({ userId: "user-1", expiresAt: now, revokedAt: null }, "user-1", now), false, "expired session must be rejected");
	assert.equal(isActiveSessionRecord({ userId: "user-1", expiresAt: new Date(now.getTime() + 1), revokedAt: now }, "user-1", now), false, "revoked session must be rejected");
	assert.equal(isActiveSessionRecord({ userId: "user-2", expiresAt: new Date(now.getTime() + 1), revokedAt: null }, "user-1", now), false, "session cannot be used by another user");
	assert.equal(isLoginTicketCurrent(new Date(now.getTime() - 1), now), true, "ticket minted after password change may complete login");
	assert.equal(isLoginTicketCurrent(new Date(now.getTime() + 1), now), false, "password reset must invalidate an older in-flight login ticket");
	assert.equal(isLoginTicketCurrent(null, now), false, "ticket cannot complete if password-change state is unavailable");
	assert.equal(clearExpiredOtpLock(new Date(now.getTime() - 1), now), null, "expired OTP lock should be cleared on a new challenge");
	assert.equal(clearExpiredOtpLock(new Date(now.getTime() + 1), now)?.getTime(), now.getTime() + 1, "active OTP lock must remain intact");
	assert.equal(clearExpiredOtpLock(null, now), null, "no OTP lock remains absent");
	assert.equal(canBootstrapSuperAdminPhone({ role: "SUPER_ADMIN", passwordHash: "bcrypt-hash", phoneVerifiedAt: null }), true, "unverified password-backed Super Admin may bootstrap phone verification");
	assert.equal(canBootstrapSuperAdminPhone({ role: "ORG_ADMIN", passwordHash: "bcrypt-hash", phoneVerifiedAt: null }), false, "organization admins cannot use the bootstrap route");
	assert.equal(canBootstrapSuperAdminPhone({ role: "SUPER_ADMIN", passwordHash: null, phoneVerifiedAt: null }), false, "passwordless accounts cannot use bootstrap");
	assert.equal(canBootstrapSuperAdminPhone({ role: "SUPER_ADMIN", passwordHash: "bcrypt-hash", phoneVerifiedAt: now }), false, "verified accounts cannot replace their phone through bootstrap");
	assert.equal(isValidWebAuthnOriginConfig("http://localhost:3000", "localhost", false), true, "local WebAuthn origin should be valid during development");
	assert.equal(isValidWebAuthnOriginConfig("https://app.example.com", "app.example.com", true), true, "production HTTPS origin should accept its host RP ID");
	assert.equal(isValidWebAuthnOriginConfig("http://app.example.com", "app.example.com", true), false, "production must reject HTTP WebAuthn origin");
	assert.equal(isValidWebAuthnOriginConfig("https://app.example.com", "other.example.com", true), false, "RP ID outside the origin domain must be rejected");
	assert.equal(isValidWebAuthnOriginConfig(undefined, "localhost", false), false, "missing origin must keep passkey registration unavailable");

	assert.deepEqual(sanitizeSecurityEventDetails({ action: "passkey_authentication_failure", attempts: 2, password: "secret", otp: "123456", phone: "+8801712345678", email: "user@example.com" }), {
		action: "passkey_authentication_failure",
		attempts: 2,
	}, "audit metadata must strip secret keys and PII values");
	assert.equal(sanitizeSecurityEventDetails({ tokenValue: "abc", safeEmailAddress: "user@example.com" }), undefined, "audit metadata containing only sensitive values must be omitted");
	assert.deepEqual(sanitizeSecurityEventDetails({ action: "test\nvalue" }), { action: "testvalue" }, "audit text must have control characters removed");
	assert.equal(isGreenwebSmsAccepted([{ to: "+8801712345678", status: "SENT", statusmsg: "SMS Sent Successfully" }], "+8801712345678"), true, "Greenweb SENT response for the requested recipient is accepted");
	assert.equal(isGreenwebSmsAccepted([{ to: "01712345678", status: "SENT" }], "+8801712345678"), true, "Greenweb local-format recipient is normalized before matching");
	assert.equal(isGreenwebSmsAccepted([{ to: "+8801712345678", status: "FAILED" }], "+8801712345678"), false, "failed Greenweb response is rejected");
	assert.equal(isGreenwebSmsAccepted([{ to: "+8801812345678", status: "SENT" }], "+8801712345678"), false, "success for a different recipient is rejected");
	assert.equal(isGreenwebSmsAccepted({ status: "SENT" }, "+8801712345678"), false, "unexpected response shape is rejected");

	const donorDateBounds = getDonorDonationDateBounds("2026-10-01", "2026-10-05");
	assert.equal(donorDateBounds.gte?.toISOString(), "2026-09-30T18:00:00.000Z", "Dhaka local start date must map to UTC correctly");
	assert.equal(donorDateBounds.lt?.toISOString(), "2026-10-05T18:00:00.000Z", "end date is inclusive through Dhaka local day");
	assert.equal(matchesPeriodDonationFilters({ total: 2000, count: 2, minAmount: 2000 }), true, "exact amount threshold should match");
	assert.equal(matchesPeriodDonationFilters({ total: 1999, count: 2, minAmount: 2000 }), false, "below-amount donor should not match");
	assert.equal(matchesPeriodDonationFilters({ total: 2500, count: 1, minAmount: 2000, maxAmount: 3000 }), true, "period amount within range should match");
	assert.equal(matchesPeriodDonationFilters({ total: 2500, count: 1, minAmount: 2000, minCount: 2 }), false, "period donation count is also respected");

	console.info("Security acceptance tests passed (OTP, rate limits, WebAuthn, sessions, audit sanitization, Greenweb SMS and donor date filters).");
}).catch((error: unknown) => {
	console.error(error);
	process.exitCode = 1;
});
