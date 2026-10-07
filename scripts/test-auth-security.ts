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
	import("../src/lib/bangladesh-phone"),
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
	nextOtpFailure,
	evaluateRateLimit,
	isPasskeyChallengeUsable,
	isCredentialTrustedForUser,
	isTrustedDeviceRecordUsable,
	prefersMobileAuthFlow,
	sanitizeSecurityEventDetails,
	}, {
		isStrongAuthSession,
		isActiveSessionRecord,
		isMobileAppSessionIdle,
		isMobileAppSessionLocked,
		mobileAppLockTimestamp,
		canUnlockMobileAppWithOtp,
		canUnlockMobileAppWithPasskey,
		isLoginTicketCurrent,
		clearExpiredOtpLock,
		canBootstrapSuperAdminPhone,
		canBootstrapEmployeePhone,
		canBootstrapPasswordAdminPhone,
		canCreatePhoneOnlyOrgAdmin,
		canContinueLegacyAdminLogin,
		canMigrateOrgAdminToPasswordless,
		canGenerateAccountRecoveryCodes,
		canOrgAdminAccessOrganization,
		canLoginWithPassword,
		canCompletePasswordlessAdminEnrollment,
		isPhonePasswordlessFirstPasskeyEligible,
		isLegacyPhoneAccountMigrationEligible,
		canEmployeeReceiveSession,
		canEmployeeCompleteFirstPasskey,
		canRequestEmployeeEnrollmentOtp,
		chooseEmployeeLoginFactor,
		canEmployeeFallbackToOtp,
		isRegisteredEmployeeOtpDestination,
		isEmployeeEnrollmentHandoff,
		isEmployeeFirstPasskeyTicket,
		isPhoneOnlyEmployeeInviteAllowed,
		isPasswordlessEmployeeInvite,
		isValidWebAuthnOriginConfig,
	}, { isGreenwebSmsAccepted }, { getDonorDonationDateBounds, matchesPeriodDonationFilters }, { normalizeBangladeshMobile }]) => {
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
	assert.equal(isMobileAppSessionIdle(new Date(now.getTime() - 5 * 60_000 + 1), now), false, "mobile session remains unlocked until five full minutes inactive");
	assert.equal(isMobileAppSessionIdle(new Date(now.getTime() - 5 * 60_000), now), true, "mobile session locks at five minutes idle");
	assert.equal(isMobileAppSessionLocked({ role: "ORG_USER", lockEnabled: true, lastUsedAt: new Date(now.getTime() - 5 * 60_000), now }), true, "protected employee API guard denies requests while the mobile session is idle-locked");
	assert.equal(isMobileAppSessionLocked({ role: "ORG_USER", lockEnabled: true, lastUsedAt: now, now }), false, "protected employee API guard allows a recently unlocked session");
	assert.equal(isMobileAppSessionLocked({ role: "ORG_ADMIN", lockEnabled: true, lastUsedAt: new Date(now.getTime() - 6 * 60_000), now }), false, "mobile employee lock does not affect administrators");
	assert.equal(mobileAppLockTimestamp(now).getTime(), now.getTime() - 5 * 60_000, "explicit app background can mark the session immediately idle");
	const idleUnlockState = { role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, currentSessionId: "session-1", suppliedSessionId: "session-1", sessionMobileLockEnabled: true, sessionRevokedAt: null, sessionExpiresAt: new Date(now.getTime() + 60_000), lastUsedAt: new Date(now.getTime() - 5 * 60_000), now };
	assert.equal(canUnlockMobileAppWithOtp(idleUnlockState), true, "OTP can unlock the current active idle employee session");
	assert.equal(canUnlockMobileAppWithOtp({ ...idleUnlockState, suppliedSessionId: "session-2" }), false, "OTP unlock cannot be transferred to another session");
	assert.equal(canUnlockMobileAppWithOtp({ ...idleUnlockState, sessionRevokedAt: now }), false, "revoked session cannot be unlocked");
	assert.equal(canUnlockMobileAppWithOtp({ ...idleUnlockState, lastUsedAt: new Date(now.getTime() - 30_000) }), false, "OTP cannot be used to replace a still-active session");
	assert.equal(canUnlockMobileAppWithPasskey({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, sessionId: "session-1", sessionUserId: "session-1", sessionMobileLockEnabled: true, sessionRevokedAt: null, sessionExpiresAt: new Date(now.getTime() + 60_000), lastUsedAt: new Date(now.getTime() - 5 * 60_000), now }), true, "passkey can unlock the current active idle employee session");
	assert.equal(canUnlockMobileAppWithPasskey({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, sessionId: "session-1", sessionUserId: "session-1", sessionMobileLockEnabled: true, sessionRevokedAt: null, sessionExpiresAt: new Date(now.getTime() + 60_000), lastUsedAt: now, now }), false, "passkey unlock endpoint only operates on a locked session");
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
	const trustedRecord = { exists: true, userId: "user-1", deviceUserId: "user-1", credentialId: "credential-1", trustedCredentialId: "credential-1", credentialUserId: "user-1", deviceRevokedAt: null, credentialRevokedAt: null, createdAt: now, now };
	assert.equal(isTrustedDeviceRecordUsable(trustedRecord), true, "valid trusted device permits passkey-first mobile login");
	assert.equal(isTrustedDeviceRecordUsable({ ...trustedRecord, exists: false }), false, "new OTP-authenticated device is not trusted without an explicit passkey registration record");
	assert.equal(isTrustedDeviceRecordUsable({ ...trustedRecord, credentialRevokedAt: now }), false, "revoked passkey cannot be trusted for sign-in");
	assert.equal(isTrustedDeviceRecordUsable({ ...trustedRecord, deviceUserId: "user-2" }), false, "trusted device record cannot be transferred to a different user");
	assert.equal(isTrustedDeviceRecordUsable({ ...trustedRecord, createdAt: new Date(now.getTime() - 366 * 24 * 60 * 60_000) }), false, "expired trust record must not select passkey-first login");
	assert.equal(prefersMobileAuthFlow(new Headers({ "sec-ch-ua-mobile": "?1" })), true, "mobile client hint should select the mobile auth UX");
	assert.equal(prefersMobileAuthFlow(new Headers({ "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" })), true, "iOS Safari should select mobile UX without client hints");
	assert.equal(prefersMobileAuthFlow(new Headers({ "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0.0.0 Safari/537.36" })), false, "desktop browser should not be classified as mobile by UX hint");
	assert.equal(chooseEmployeeLoginFactor({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, hasTrustedActivePasskey: true, mobile: true }), "passkey", "trusted active passkey on mobile selects passkey-first login");
	assert.equal(chooseEmployeeLoginFactor({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, hasTrustedActivePasskey: true, mobile: false }), "otp", "desktop always uses phone OTP even when this account has a trusted mobile");
	assert.equal(chooseEmployeeLoginFactor({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, hasTrustedActivePasskey: false, mobile: true }), "otp", "new or untrusted device must use phone OTP");
	assert.equal(chooseEmployeeLoginFactor({ role: "ORG_USER", phoneVerifiedAt: null, organizationActive: true, hasTrustedActivePasskey: true, mobile: true }), null, "unverified employee cannot start returning-device sign-in");
	assert.equal(chooseEmployeeLoginFactor({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: false, hasTrustedActivePasskey: true, mobile: true }), null, "employee from a deleted organization cannot sign in");
	assert.equal(chooseEmployeeLoginFactor({ role: "SUPER_ADMIN", phoneVerifiedAt: null, organizationActive: true, hasTrustedActivePasskey: true, mobile: true }), "admin", "Super Admin factor selection remains separate");
	assert.equal(isRegisteredEmployeeOtpDestination({ role: "ORG_USER", phoneVerifiedAt: now, registeredPhone: "+8801521434555", destination: "+8801521434555" }), true, "employee OTP must target the verified registered phone");
	assert.equal(isRegisteredEmployeeOtpDestination({ role: "ORG_USER", phoneVerifiedAt: now, registeredPhone: "+8801521434555", destination: "+8801812345678" }), false, "employee OTP cannot target a different supplied number");
	assert.equal(isRegisteredEmployeeOtpDestination({ role: "ORG_USER", phoneVerifiedAt: null, registeredPhone: "+8801521434555", destination: "+8801521434555" }), false, "unverified number is not a valid returning-login destination");
	assert.equal(canEmployeeFallbackToOtp({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, preAuthPasskeyOnly: true, deliveryChannel: "sms" }), true, "active employee can explicitly fall back from trusted passkey to registered-phone OTP");
	assert.equal(canEmployeeFallbackToOtp({ role: "ORG_USER", phoneVerifiedAt: now, organizationActive: true, preAuthPasskeyOnly: false, deliveryChannel: "sms" }), false, "OTP fallback cannot be invoked from an already-OTP login attempt");
	assert.equal(canEmployeeFallbackToOtp({ role: "ORG_ADMIN", phoneVerifiedAt: now, organizationActive: true, preAuthPasskeyOnly: true, deliveryChannel: "sms" }), true, "passwordless Org Admin can fall back from mobile passkey to their registered-phone OTP");
	assert.equal(canEmployeeFallbackToOtp({ role: "SUPER_ADMIN", phoneVerifiedAt: now, organizationActive: true, preAuthPasskeyOnly: true, deliveryChannel: "sms" }), false, "Super Admin's separate authentication flow is not changed");

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
	assert.equal(canBootstrapEmployeePhone({ role: "ORG_USER", passwordHash: "bcrypt-hash", phoneVerifiedAt: null }), true, "invited employee may verify the phone attached to the invitation");
	assert.equal(canBootstrapEmployeePhone({ role: "ORG_ADMIN", passwordHash: "bcrypt-hash", phoneVerifiedAt: null }), false, "admins cannot use employee phone bootstrap");
	assert.equal(canBootstrapEmployeePhone({ role: "ORG_USER", passwordHash: null, phoneVerifiedAt: null }), false, "passwordless employee cannot use employee phone bootstrap");
	assert.equal(canBootstrapEmployeePhone({ role: "ORG_USER", passwordHash: "bcrypt-hash", phoneVerifiedAt: now }), false, "already verified employee cannot replace phone through bootstrap");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: null, organizationActive: true }), true, "active legacy Org Admin may verify a first phone without losing password access");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: null, organizationActive: false }), false, "Org Admin from inactive/deleted org cannot bootstrap phone");
	assert.equal(canCreatePhoneOnlyOrgAdmin({ actorRole: "SUPER_ADMIN", organizationActive: true, phoneAlreadyRegistered: false, authReady: true }), true, "Super Admin may provision a phone-only Org Admin when factors are ready");
	assert.equal(canCreatePhoneOnlyOrgAdmin({ actorRole: "ORG_ADMIN", organizationActive: true, phoneAlreadyRegistered: false, authReady: true }), false, "Org Admin cannot provision another Org Admin");
	assert.equal(canCreatePhoneOnlyOrgAdmin({ actorRole: "SUPER_ADMIN", organizationActive: true, phoneAlreadyRegistered: false, authReady: false }), false, "do not create a phone-only admin when OTP/passkey configuration is unavailable");
	assert.equal(canContinueLegacyAdminLogin({ role: "ORG_ADMIN", passwordHash: "legacy-hash", organizationActive: true }), true, "legacy Org Admin remains able to use existing password login before migration");
	assert.equal(canContinueLegacyAdminLogin({ role: "ORG_ADMIN", passwordHash: null, organizationActive: true }), false, "passwordless Org Admin cannot fall back to password login");
	assert.equal(isLegacyPhoneAccountMigrationEligible({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: now }), true, "legacy Admin with verified phone may prepare migration");
	assert.equal(canMigrateOrgAdminToPasswordless({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: now, organizationActive: true, hasActivePasskey: true, suppliedPasswordValid: true, authenticationReady: true }), true, "migration requires legacy password, verified phone, passkey and full auth readiness");
	assert.equal(canMigrateOrgAdminToPasswordless({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: null, organizationActive: true, hasActivePasskey: true, suppliedPasswordValid: true, authenticationReady: true }), false, "migration before phone verification is rejected");
	assert.equal(canMigrateOrgAdminToPasswordless({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: now, organizationActive: true, hasActivePasskey: false, suppliedPasswordValid: true, authenticationReady: true }), false, "migration before passkey registration is rejected");
	assert.equal(canMigrateOrgAdminToPasswordless({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: now, organizationActive: true, hasActivePasskey: true, suppliedPasswordValid: true, authenticationReady: false }), false, "migration is held until passwordless auth fully configured");
	assert.equal(canOrgAdminAccessOrganization({ role: "ORG_ADMIN", userOrganizationId: "org-1", organizationId: "org-1", organizationActive: true }), true, "legacy and migrated Admin retain own-org access");
	assert.equal(canOrgAdminAccessOrganization({ role: "ORG_ADMIN", userOrganizationId: "org-1", organizationId: "org-2", organizationActive: true }), false, "Org Admin access cannot cross organization boundary");
	assert.equal(canOrgAdminAccessOrganization({ role: "ORG_ADMIN", userOrganizationId: "org-1", organizationId: "org-1", organizationActive: false }), false, "deleted organization access is rejected");
	assert.equal(canLoginWithPassword({ role: "SUPER_ADMIN", passwordHash: "admin-hash", phoneVerifiedAt: null }), true, "Super Admin remains password-secured");
	assert.equal(canLoginWithPassword({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: now }), true, "legacy Org Admin keeps password flow until explicit migration");
	assert.equal(canLoginWithPassword({ role: "ORG_ADMIN", passwordHash: null, phoneVerifiedAt: now }), false, "new or migrated Org Admin uses phone OTP/passkey, not password");
	assert.equal(canGenerateAccountRecoveryCodes({ role: "ORG_ADMIN", passwordHash: null, phoneVerifiedAt: now, hasActivePasskey: true }), true, "passwordless Admin can generate recovery codes with active verified factors");
	assert.equal(canGenerateAccountRecoveryCodes({ role: "ORG_ADMIN", passwordHash: null, phoneVerifiedAt: now, hasActivePasskey: false }), false, "passwordless Admin cannot generate recovery codes before passkey setup");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "SUPER_ADMIN", passwordHash: "super-hash", phoneVerifiedAt: null, organizationActive: true }), true, "Super Admin phone bootstrap remains valid");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: null, organizationActive: true }), true, "legacy Org Admin can verify a phone and keep current password until explicit migration");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "ORG_ADMIN", passwordHash: null, phoneVerifiedAt: null, organizationActive: true }), false, "new passwordless Org Admin must use invite OTP flow, not password-account bootstrap");
	assert.equal(canBootstrapPasswordAdminPhone({ role: "ORG_ADMIN", passwordHash: "legacy-hash", phoneVerifiedAt: null, organizationActive: false }), false, "deleted-organization legacy admin cannot recover/bootstrap phone");
	assert.equal(isPhonePasswordlessFirstPasskeyEligible({ role: "ORG_ADMIN", phoneVerifiedAt: null, passwordHash: null, organizationActive: true, hasActivePasskey: false, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), true, "new phone-only Org Admin invite may enroll through OTP and first passkey");
	assert.equal(isPhonePasswordlessFirstPasskeyEligible({ role: "ORG_ADMIN", phoneVerifiedAt: null, passwordHash: "legacy-hash", organizationActive: true, hasActivePasskey: false, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), false, "legacy password-backed Org Admin cannot use the new-account invite flow");
	const adminEnrollment = { role: "ORG_ADMIN", passwordHash: null, phoneVerifiedAt: now, orgActive: true, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: now, enrollmentExpiresAt: new Date(now.getTime() + 60_000), hasActivePasskey: true, now };
	assert.equal(canCompletePasswordlessAdminEnrollment(adminEnrollment), true, "phone-provisioned Admin completes first-passkey onboarding successfully");
	assert.equal(canCompletePasswordlessAdminEnrollment({ ...adminEnrollment, passwordHash: "legacy-hash" }), false, "legacy password account cannot consume phone-only invite enrollment");
	assert.equal(canCompletePasswordlessAdminEnrollment({ ...adminEnrollment, orgActive: false }), false, "phone-only Admin enrollment cannot grant a session for a deleted organization");
	assert.equal(canCompletePasswordlessAdminEnrollment({ ...adminEnrollment, hasActivePasskey: false }), false, "phone-only Admin enrollment cannot complete without first passkey");
	assert.equal(canEmployeeReceiveSession({ role: "ORG_USER", phoneVerifiedAt: null }), false, "unverified employee cannot receive an authenticated session");
	assert.equal(canEmployeeReceiveSession({ role: "ORG_USER", phoneVerifiedAt: now }), true, "verified employee may receive a session after successful factor completion");
	assert.equal(canEmployeeReceiveSession({ role: "SUPER_ADMIN", phoneVerifiedAt: null }), true, "Super Admin retains the separate secure login policy");
	assert.equal(canRequestEmployeeEnrollmentOtp({ role: "ORG_USER", phoneVerifiedAt: null, passwordHash: null, hasActivePasskey: false, organizationActive: true }), true, "passwordless, unverified employee invite may begin onboarding");
	assert.equal(canRequestEmployeeEnrollmentOtp({ role: "ORG_USER", phoneVerifiedAt: now, passwordHash: null, hasActivePasskey: false, organizationActive: true }), false, "already verified legacy employee cannot use first-invite onboarding");
	assert.equal(canRequestEmployeeEnrollmentOtp({ role: "ORG_USER", phoneVerifiedAt: null, passwordHash: "hash", hasActivePasskey: false, organizationActive: true }), false, "password-backed employee cannot use first-invite onboarding");
	assert.equal(canEmployeeCompleteFirstPasskey({ role: "ORG_USER", phoneVerifiedAt: null, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), true, "valid OTP enrollment state may register the mandatory first passkey before phone verification is committed");
	assert.equal(canEmployeeCompleteFirstPasskey({ role: "ORG_USER", phoneVerifiedAt: now, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), false, "verified accounts cannot reuse first-time enrollment");
	assert.equal(canEmployeeCompleteFirstPasskey({ role: "ORG_USER", phoneVerifiedAt: null, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: now, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), false, "consumed enrollment state cannot be reused");
	assert.equal(canEmployeeCompleteFirstPasskey({ role: "ORG_USER", phoneVerifiedAt: null, enrollmentMarker: "employee-enrollment", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: now, now }), false, "expired enrollment state cannot register a passkey");
	assert.equal(canEmployeeCompleteFirstPasskey({ role: "ORG_USER", phoneVerifiedAt: null, enrollmentMarker: "other", passkeyOnly: true, enrollmentConsumedAt: null, enrollmentExpiresAt: new Date(now.getTime() + 60_000), now }), false, "non-enrollment pre-auth cannot be used to register the first employee passkey");
	assert.equal(isEmployeeEnrollmentHandoff({ hasOnboardingTicket: true, hasLoginTicket: false, onboardingTicketLength: 43 }), "onboarding", "valid one-time onboarding ticket selects enrollment handoff");
	assert.equal(isEmployeeEnrollmentHandoff({ hasOnboardingTicket: false, hasLoginTicket: true }), "login", "login ticket selects standard MFA handoff");
	assert.equal(isEmployeeEnrollmentHandoff({ hasOnboardingTicket: true, hasLoginTicket: true, onboardingTicketLength: 43 }), null, "ambiguous dual-ticket handoff is rejected");
	assert.equal(isEmployeeEnrollmentHandoff({ hasOnboardingTicket: true, hasLoginTicket: false, onboardingTicketLength: 12 }), null, "short onboarding ticket is rejected");
	assert.equal(isEmployeeFirstPasskeyTicket({ role: "ORG_USER", phoneVerifiedAt: now, preAuthMarker: "employee-enrollment", passkeyOnly: true, preAuthConsumedAt: now, preAuthExpiresAt: new Date(now.getTime() + 60_000), now }), true, "first-passkey ticket may finalize the verified employee session");
	assert.equal(isEmployeeFirstPasskeyTicket({ role: "ORG_USER", phoneVerifiedAt: null, preAuthMarker: "employee-enrollment", passkeyOnly: true, preAuthConsumedAt: now, preAuthExpiresAt: new Date(now.getTime() + 60_000), now }), false, "employee session handoff cannot finalize before phone verification commit");
	assert.equal(isEmployeeFirstPasskeyTicket({ role: "ORG_USER", phoneVerifiedAt: now, preAuthMarker: "employee-enrollment", passkeyOnly: false, preAuthConsumedAt: now, preAuthExpiresAt: new Date(now.getTime() + 60_000), now }), false, "first-passkey ticket must be passkey-only");
	assert.equal(isPhoneOnlyEmployeeInviteAllowed({ role: "ORG_ADMIN", phoneAlreadyRegistered: false }), true, "organization admin may invite a new phone-only employee");
	assert.equal(isPhoneOnlyEmployeeInviteAllowed({ role: "SUPER_ADMIN", phoneAlreadyRegistered: false }), true, "super admin may invite a new phone-only employee");
	assert.equal(isPhoneOnlyEmployeeInviteAllowed({ role: "ORG_USER", phoneAlreadyRegistered: false }), false, "employees cannot create employee accounts");
	assert.equal(isPhoneOnlyEmployeeInviteAllowed({ role: "ORG_ADMIN", phoneAlreadyRegistered: true }), false, "an already-registered phone cannot be invited again");
	assert.equal(isPasswordlessEmployeeInvite({ role: "ORG_USER", phoneVerifiedAt: null, passwordHash: null }), true, "new employee invite is phone-only and unverified without password");
	assert.equal(isPasswordlessEmployeeInvite({ role: "ORG_USER", phoneVerifiedAt: now, passwordHash: null }), false, "invited employee phone must remain unverified until OTP onboarding");
	assert.equal(isPasswordlessEmployeeInvite({ role: "ORG_USER", phoneVerifiedAt: null, passwordHash: "bcrypt-hash" }), false, "new employee invite must not create a password hash");
	assert.equal(isPasswordlessEmployeeInvite({ role: "ORG_ADMIN", phoneVerifiedAt: null, passwordHash: null }), false, "Phase 1 employee policy does not silently change admin accounts");
	assert.equal(normalizeBangladeshMobile("01521434555"), "+8801521434555", "local 01 phone normalizes to canonical E.164");
	assert.equal(normalizeBangladeshMobile("8801521434555"), "+8801521434555", "880-prefixed number normalizes to canonical E.164");
	assert.equal(normalizeBangladeshMobile("+8801521434555"), "+8801521434555", "canonical E.164 phone remains unchanged");
	assert.equal(normalizeBangladeshMobile("01212345678"), null, "unsupported BD operator prefix is rejected");
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
