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
