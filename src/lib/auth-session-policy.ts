export function isStrongAuthSession(
  user: { authSessionId: string | null; mfaVerifiedAt: number | null } | null,
  mfaEnabled: boolean,
) {
  if (!user) return false;
  if (!mfaEnabled) return true;
  return Boolean(user.authSessionId && user.mfaVerifiedAt);
}

export function isActiveSessionRecord(
  session: { userId: string; expiresAt: Date; revokedAt: Date | null } | null,
  userId: string,
  now: Date,
) {
  return Boolean(session && session.userId === userId && session.revokedAt === null && session.expiresAt > now);
}

export const MOBILE_APP_LOCK_IDLE_MS = 5 * 60_000;

export function isMobileAppSessionIdle(lastUsedAt: Date, now: Date, idleTimeoutMs = MOBILE_APP_LOCK_IDLE_MS) {
  return now.getTime() - lastUsedAt.getTime() >= idleTimeoutMs;
}

export function isMobileAppSessionLocked(input: { role: string; lockEnabled: boolean; lastUsedAt: Date; now: Date }) {
  return input.role === "ORG_USER" && input.lockEnabled && isMobileAppSessionIdle(input.lastUsedAt, input.now);
}

export function mobileAppLockTimestamp(now: Date, idleTimeoutMs = MOBILE_APP_LOCK_IDLE_MS) {
  return new Date(now.getTime() - idleTimeoutMs);
}

export function canUnlockMobileAppWithOtp(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  currentSessionId: string | null;
  suppliedSessionId: string | null;
  sessionMobileLockEnabled: boolean;
  sessionRevokedAt: Date | null;
  sessionExpiresAt: Date | null;
  lastUsedAt: Date;
  now: Date;
}) {
  return input.role === "ORG_USER" &&
    Boolean(input.phoneVerifiedAt) &&
    input.organizationActive &&
    Boolean(input.currentSessionId) &&
    input.currentSessionId === input.suppliedSessionId &&
    input.sessionMobileLockEnabled &&
    input.sessionRevokedAt === null &&
    Boolean(input.sessionExpiresAt && input.sessionExpiresAt > input.now) &&
    isMobileAppSessionIdle(input.lastUsedAt, input.now);
}

export function canUnlockMobileAppWithPasskey(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  sessionId: string | null;
  sessionUserId: string | null;
  sessionMobileLockEnabled: boolean;
  sessionRevokedAt: Date | null;
  sessionExpiresAt: Date | null;
  lastUsedAt: Date;
  now: Date;
}) {
  return input.role === "ORG_USER" &&
    Boolean(input.phoneVerifiedAt) &&
    input.organizationActive &&
    Boolean(input.sessionId) &&
    input.sessionId === input.sessionUserId &&
    input.sessionMobileLockEnabled &&
    input.sessionRevokedAt === null &&
    Boolean(input.sessionExpiresAt && input.sessionExpiresAt > input.now) &&
    isMobileAppSessionIdle(input.lastUsedAt, input.now);
}

export function isLoginTicketCurrent(
  passwordChangedAt: Date | null,
  preAuthCreatedAt: Date,
) {
  return Boolean(passwordChangedAt && passwordChangedAt <= preAuthCreatedAt);
}

export function clearExpiredOtpLock(lockedUntil: Date | null, now: Date) {
  return lockedUntil && lockedUntil > now ? lockedUntil : null;
}

export function canBootstrapSuperAdminPhone(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
}) {
  return input.role === "SUPER_ADMIN" && Boolean(input.passwordHash) && input.phoneVerifiedAt === null;
}

export function canBootstrapPasswordAdminPhone(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
}) {
  return (input.role === "SUPER_ADMIN" || input.role === "ORG_ADMIN") && Boolean(input.passwordHash) && input.phoneVerifiedAt === null && input.organizationActive;
}

export function canBootstrapEmployeePhone(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
}) {
  return input.role === "ORG_USER" && Boolean(input.passwordHash) && input.phoneVerifiedAt === null;
}

export function canRequestEmployeeEnrollmentOtp(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  hasActivePasskey: boolean;
  organizationActive: boolean;
}) {
  return isPhoneOnlyPasswordlessRole(input.role) && input.phoneVerifiedAt === null && input.passwordHash === null && !input.hasActivePasskey && input.organizationActive;
}

export function isPhoneOnlyPasswordlessRole(role: string) {
  return role === "ORG_USER" || role === "ORG_ADMIN";
}

export function canAccessAdminArea(role: string) {
  return role === "SUPER_ADMIN" || role === "ORG_ADMIN";
}

export function canManageAdminOrganization(input: {
  actorRole: string;
  actorOrgId: string | null;
  targetOrgId: string;
  targetOrganizationActive: boolean;
}) {
  if (!input.targetOrganizationActive) return false;
  if (input.actorRole === "SUPER_ADMIN") return true;
  return input.actorRole === "ORG_ADMIN" && Boolean(input.actorOrgId) && input.actorOrgId === input.targetOrgId;
}

export function canManageOrganizationData(input: {
  actorRole: string;
  actorOrgId: string | null;
  targetOrgId: string;
  targetOrganizationActive: boolean;
}) {
  return (input.actorRole === "SUPER_ADMIN" || input.actorRole === "ORG_ADMIN") && canManageAdminOrganization(input);
}

export function canProvisionAdminAccount(input: {
  actorRole: string;
  actorOrgId: string | null;
  targetRole: string;
  targetOrgId: string;
  targetOrganizationActive: boolean;
  authenticationReady?: boolean;
}) {
  if (!input.targetOrganizationActive) return false;
  if (input.actorRole === "SUPER_ADMIN") {
    return input.targetRole === "ORG_USER" || (input.targetRole === "ORG_ADMIN" && input.authenticationReady === true);
  }
  return input.actorRole === "ORG_ADMIN" &&
    input.targetRole === "ORG_USER" &&
    Boolean(input.actorOrgId) &&
    input.actorOrgId === input.targetOrgId;
}

export function canViewAdminAccounts(actorRole: string, targetRole: string) {
  if (actorRole === "SUPER_ADMIN") return targetRole === "ORG_ADMIN" || targetRole === "ORG_USER";
  return actorRole === "ORG_ADMIN" && targetRole === "ORG_USER";
}

export function getAdminAccountStatusDetails(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  hasActivePasskey: boolean;
  authenticationReady: boolean;
  disabledAt?: Date | null;
}) {
  const status = getAdminAccountStatus(input);
  return {
    status,
    migrationBlockers: input.role === "ORG_ADMIN" && input.passwordHash !== null && !input.disabledAt
      ? [
          ...(!input.phoneVerifiedAt ? ["verified_phone"] : []),
          ...(!input.hasActivePasskey ? ["active_passkey"] : []),
          ...(!input.authenticationReady ? ["authentication_configuration"] : []),
        ]
      : [],
  } as const;
}

export function canAdministerEmployeeAccount(input: {
  actorRole: string;
  actorOrgId: string | null;
  targetRole: string;
  targetOrgId: string | null;
  targetOrganizationActive: boolean;
}) {
  return input.targetRole === "ORG_USER" && Boolean(input.targetOrgId) && canManageAdminOrganization({
    actorRole: input.actorRole,
    actorOrgId: input.actorOrgId,
    targetOrgId: input.targetOrgId ?? "",
    targetOrganizationActive: input.targetOrganizationActive,
  });
}

export function canAuthenticateAccount(input: { role: string; disabledAt: Date | null; organizationActive: boolean }) {
  return !input.disabledAt && (input.role === "SUPER_ADMIN" || input.organizationActive);
}

export function canReactivateEmployee(input: {
  actorRole: string;
  actorOrgId: string | null;
  targetRole: string;
  targetOrgId: string | null;
  targetOrganizationActive: boolean;
  currentlyDisabled: boolean;
}) {
  return input.currentlyDisabled && canAdministerEmployeeAccount(input);
}

export function canRetireLegacyAuthentication(input: { outstandingLegacyAccounts: number; ownerConfirmedExemptions: number; recoveryExerciseComplete: boolean }) {
  return input.outstandingLegacyAccounts === 0 && input.ownerConfirmedExemptions >= 0 && input.recoveryExerciseComplete;
}

export function canProvisionAdminRole(actorRole: string, targetRole: string) {
  if (actorRole === "SUPER_ADMIN") return targetRole === "ORG_ADMIN";
  return actorRole === "ORG_ADMIN" && targetRole === "ORG_USER";
}

export function getAdminAccountStatus(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  hasActivePasskey: boolean;
  authenticationReady: boolean;
  disabledAt?: Date | null;
}) {
  if (input.disabledAt) return "disabled" as const;
  if (input.role === "SUPER_ADMIN") return input.passwordHash ? "legacy_password" as const : "passwordless" as const;
  if (input.role === "ORG_ADMIN" && input.passwordHash) {
    if (!input.phoneVerifiedAt) return "legacy_phone_unverified" as const;
    if (input.hasActivePasskey && input.authenticationReady) return "ready_to_migrate" as const;
    if (!input.hasActivePasskey) return "legacy_passkey_missing" as const;
    return "legacy_password" as const;
  }
  if (!input.phoneVerifiedAt) return "phone_unverified" as const;
  if (input.passwordHash) {
    return "legacy_password" as const;
  }
  if ((input.role === "ORG_USER" || input.role === "ORG_ADMIN") && !input.hasActivePasskey) return "passkey_missing" as const;
  return "passwordless" as const;
}


export function canCreatePhoneOnlyOrgAdmin(input: {
  actorRole: string;
  organizationActive: boolean;
  phoneAlreadyRegistered: boolean;
  authReady: boolean;
}) {
  return input.actorRole === "SUPER_ADMIN" && input.organizationActive && !input.phoneAlreadyRegistered && input.authReady;
}

export function canContinueLegacyAdminLogin(input: {
  role: string;
  passwordHash: string | null;
  organizationActive: boolean;
}) {
  return input.role === "ORG_ADMIN" && Boolean(input.passwordHash) && input.organizationActive;
}

export function canMigrateOrgAdminToPasswordless(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  hasActivePasskey: boolean;
  suppliedPasswordValid: boolean;
  authenticationReady: boolean;
}) {
  return input.role === "ORG_ADMIN" &&
    Boolean(input.passwordHash) &&
    Boolean(input.phoneVerifiedAt) &&
    input.organizationActive &&
    input.hasActivePasskey &&
    input.suppliedPasswordValid &&
    input.authenticationReady;
}

export function chooseEmployeeLoginFactor(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  hasTrustedActivePasskey: boolean;
  mobile: boolean;
}) {
  if (input.role === "SUPER_ADMIN") return "admin";
  if (!isPhoneOnlyPasswordlessRole(input.role) || !input.phoneVerifiedAt || !input.organizationActive) return null;
  return input.mobile && input.hasTrustedActivePasskey ? "passkey" : "otp";
}

export function chooseLoginFactor(input: {
  factor: "biometric" | "otp";
  role: string;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  hasTrustedActivePasskey: boolean;
  mobile: boolean;
}) {
  if (input.role !== "SUPER_ADMIN" && input.role !== "ORG_ADMIN" && input.role !== "ORG_USER") return null;
  if (!input.phoneVerifiedAt || !input.organizationActive) return null;
  if (input.role === "SUPER_ADMIN") return input.factor === "otp" ? "otp" : input.mobile && input.hasTrustedActivePasskey ? "passkey" : null;
  if (input.factor === "otp") return "otp";
  return input.mobile && input.hasTrustedActivePasskey ? "passkey" : null;
}

export function canEmployeeFallbackToOtp(input: {
  role: string;
  passwordlessAccount?: boolean;
  phoneVerifiedAt: Date | null;
  organizationActive: boolean;
  preAuthPasskeyOnly: boolean;
  deliveryChannel: string | null;
}) {
  return (input.role === "ORG_USER" || input.role === "SUPER_ADMIN" || (input.role === "ORG_ADMIN" && input.passwordlessAccount === true)) &&
    Boolean(input.phoneVerifiedAt) &&
    input.organizationActive &&
    input.preAuthPasskeyOnly &&
    input.deliveryChannel === "sms";
}

export function isRegisteredEmployeeOtpDestination(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  registeredPhone: string | null;
  destination: string | null;
}) {
  return isPhoneOnlyPasswordlessRole(input.role) &&
    Boolean(input.phoneVerifiedAt) &&
    Boolean(input.registeredPhone) &&
    input.destination === input.registeredPhone;
}

export function isEmployeeEnrollmentHandoff(input: {
  hasOnboardingTicket: boolean;
  hasLoginTicket: boolean;
  onboardingTicketLength?: number;
}) {
  if (input.hasOnboardingTicket === input.hasLoginTicket) return null;
  if (input.hasOnboardingTicket) {
    return (input.onboardingTicketLength ?? 0) >= 32 && (input.onboardingTicketLength ?? 0) <= 128 ? "onboarding" : null;
  }
  return "login";
}

export function canCompletePasswordlessAdminEnrollment(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  orgActive: boolean;
  enrollmentMarker: string | null;
  passkeyOnly: boolean;
  enrollmentConsumedAt: Date | null;
  enrollmentExpiresAt: Date;
  hasActivePasskey: boolean;
  now: Date;
}) {
  return input.role === "ORG_ADMIN" &&
    input.passwordHash === null &&
    Boolean(input.phoneVerifiedAt) &&
    input.orgActive &&
    input.enrollmentMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.enrollmentConsumedAt !== null &&
    input.enrollmentExpiresAt > input.now &&
    input.hasActivePasskey;
}

export function canEmployeeReceiveSession(input: { role: string; phoneVerifiedAt: Date | null }) {
  return input.role === "SUPER_ADMIN" || Boolean(input.phoneVerifiedAt);
}

export function canEmployeeCompleteFirstPasskey(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  enrollmentMarker: string | null;
  passkeyOnly: boolean;
  enrollmentConsumedAt: Date | null;
  enrollmentExpiresAt: Date;
  now: Date;
}) {
  return (input.role === "ORG_USER" || input.role === "ORG_ADMIN") &&
    input.phoneVerifiedAt === null &&
    input.enrollmentMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.enrollmentConsumedAt === null &&
    input.enrollmentExpiresAt > input.now;
}

export function isPhonePasswordlessFirstPasskeyEligible(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  organizationActive: boolean;
  hasActivePasskey: boolean;
  enrollmentMarker: string | null;
  passkeyOnly: boolean;
  enrollmentConsumedAt: Date | null;
  enrollmentExpiresAt: Date;
  now: Date;
}) {
  return isPhoneOnlyPasswordlessRole(input.role) &&
    input.phoneVerifiedAt === null &&
    input.passwordHash === null &&
    input.organizationActive &&
    !input.hasActivePasskey &&
    input.enrollmentMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.enrollmentConsumedAt === null &&
    input.enrollmentExpiresAt > input.now;
}

export function canGenerateAccountRecoveryCodes(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  hasActivePasskey: boolean;
}) {
  if (isPhoneOnlyPasswordlessRole(input.role) && input.phoneVerifiedAt && input.hasActivePasskey) return true;
  return Boolean(input.passwordHash);
}

export function canResetAccountPassword(input: { role: string; passwordHash: string | null }) {
  return Boolean(input.passwordHash) && (input.role === "SUPER_ADMIN" || input.role === "ORG_ADMIN" || input.role === "ORG_USER");
}

export function getRecoveryReadiness(input: { role: string; passwordHash: string | null; phoneVerifiedAt: Date | null; hasActivePasskey: boolean }) {
  const passwordResetEligible = canResetAccountPassword(input);
  const recoveryCodesEligible = canGenerateAccountRecoveryCodes(input);
  return {
    passwordResetEligible,
    recoveryCodesEligible,
    recoveryCodesNeedPasskey: !input.hasActivePasskey,
    recoveryCodesNeedPhone: !input.phoneVerifiedAt,
  } as const;
}


export function isLegacyPhoneAccountMigrationEligible(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
}) {
  return input.role === "ORG_ADMIN" && Boolean(input.passwordHash) && Boolean(input.phoneVerifiedAt);
}

export function canOrgAdminAccessOrganization(input: {
  role: string;
  userOrganizationId: string | null;
  organizationId: string;
  organizationActive: boolean;
}) {
  if (!input.organizationActive) return false;
  if (input.role === "SUPER_ADMIN") return true;
  return input.role === "ORG_ADMIN" && Boolean(input.userOrganizationId) && input.userOrganizationId === input.organizationId;
}

export function canLoginWithPassword(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
}) {
  if (input.role === "SUPER_ADMIN") return Boolean(input.passwordHash);
  if (input.role === "ORG_ADMIN") return Boolean(input.passwordHash);
  return false;
}

export function canEmployeeCompleteEnrollmentLogin(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  orgActive: boolean;
  enrollmentMarker: string | null;
  passkeyOnly: boolean;
  enrollmentConsumedAt: Date | null;
  enrollmentExpiresAt: Date;
  hasActivePasskey: boolean;
  now: Date;
}) {
  return isPhoneOnlyPasswordlessRole(input.role) &&
    Boolean(input.phoneVerifiedAt) &&
    input.orgActive &&
    input.enrollmentMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.enrollmentConsumedAt !== null &&
    input.enrollmentExpiresAt > input.now &&
    input.hasActivePasskey;
}

export function canPasswordlessOrgAdminCompleteEnrollmentLogin(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  orgActive: boolean;
  enrollmentMarker: string | null;
  passkeyOnly: boolean;
  enrollmentConsumedAt: Date | null;
  enrollmentExpiresAt: Date;
  hasActivePasskey: boolean;
  now: Date;
}) {
  return input.role === "ORG_ADMIN" &&
    input.passwordHash === null &&
    Boolean(input.phoneVerifiedAt) &&
    input.orgActive &&
    input.enrollmentMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.enrollmentConsumedAt !== null &&
    input.enrollmentExpiresAt > input.now &&
    input.hasActivePasskey;
}

export function isEmployeeFirstPasskeyTicket(input: {
  role: string;
  phoneVerifiedAt: Date | null;
  preAuthMarker: string | null;
  passkeyOnly: boolean;
  preAuthConsumedAt: Date | null;
  preAuthExpiresAt: Date;
  now: Date;
}) {
  return isPhoneOnlyPasswordlessRole(input.role) &&
    Boolean(input.phoneVerifiedAt) &&
    input.preAuthMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.preAuthConsumedAt !== null &&
    input.preAuthExpiresAt > input.now;
}

export function isPasswordlessAdminFirstPasskeyTicket(input: {
  role: string;
  passwordHash: string | null;
  phoneVerifiedAt: Date | null;
  preAuthMarker: string | null;
  passkeyOnly: boolean;
  preAuthConsumedAt: Date | null;
  preAuthExpiresAt: Date;
  now: Date;
}) {
  return input.role === "ORG_ADMIN" &&
    input.passwordHash === null &&
    Boolean(input.phoneVerifiedAt) &&
    input.preAuthMarker === "employee-enrollment" &&
    input.passkeyOnly &&
    input.preAuthConsumedAt !== null &&
    input.preAuthExpiresAt > input.now;
}

export function isPhoneOnlyEmployeeInviteAllowed(input: { role: string; phoneAlreadyRegistered: boolean }) {
  return (input.role === "ORG_ADMIN" || input.role === "SUPER_ADMIN") && !input.phoneAlreadyRegistered;
}

export function isPasswordlessEmployeeInvite(input: {
  phoneVerifiedAt: Date | null;
  passwordHash: string | null;
  role: string;
}) {
  return input.role === "ORG_USER" && input.phoneVerifiedAt === null && input.passwordHash === null;
}

export function isValidWebAuthnOriginConfig(originValue: string | undefined, rpID: string | undefined, production: boolean) {
  if (!originValue || !rpID) return false;
  try {
    const origin = new URL(originValue);
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return false;
    if (production && origin.protocol !== "https:") return false;
    if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(rpID)) return false;
    return rpID === origin.hostname || origin.hostname.endsWith(`.${rpID}`);
  } catch {
    return false;
  }
}
