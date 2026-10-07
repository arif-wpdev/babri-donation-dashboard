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
