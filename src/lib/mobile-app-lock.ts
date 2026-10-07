import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isActiveSessionRecord, isMobileAppSessionIdle, mobileAppLockTimestamp, MOBILE_APP_LOCK_IDLE_MS } from "@/lib/auth-session-policy";
import { MobileAppSessionLockedError, prefersMobileAuthFlow } from "@/lib/auth-security";
import { headers } from "next/headers";
import { createHash, randomBytes } from "node:crypto";

export type MobileLockContext = {
  userId: string;
  sessionId: string;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  lastUsedAt: Date;
  expiresAt: Date;
};

export const mobileLockUnlockCookieName = process.env.NODE_ENV === "production" ? "__Host-mobile-unlock-preauth" : "mobile-unlock-preauth";

export async function createMobileLockUnlockPreAuth(input: { userId: string; sessionId: string }) {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const preAuth = await prisma.loginPreAuth.create({ data: { userId: input.userId, tokenHash, expiresAt, deliveryChannel: "mobile-unlock", passkeyOnly: true } });
  const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
  cookieStore.set(mobileLockUnlockCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 300 });
  return { id: preAuth.id, tokenHash, expiresAt };
}

export async function getMobileLockUnlockPreAuth(userId: string) {
  const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
  const token = cookieStore.get(mobileLockUnlockCookieName)?.value;
  if (!token) return null;
  const preAuth = await prisma.loginPreAuth.findUnique({ where: { tokenHash: createHash("sha256").update(token).digest("hex") } });
  if (!preAuth || preAuth.userId !== userId || preAuth.deliveryChannel !== "mobile-unlock" || !preAuth.passkeyOnly || preAuth.consumedAt || preAuth.expiresAt <= new Date()) return null;
  return preAuth;
}

export async function clearMobileLockUnlockPreAuth() {
  const cookieStore = await import("next/headers").then(({ cookies }) => cookies());
  cookieStore.delete(mobileLockUnlockCookieName);
}

export async function getMobileLockContext(options: { allowLockedSession?: boolean } = {}) {
  const session = await auth();
  if (!session?.user?.id || !session.user.authSessionId) return null;
  if (!options.allowLockedSession) {
    try {
      await (await import("@/lib/auth-security")).requireStrongSession(session.user);
    } catch {
      return null;
    }
  }
  const record = await prisma.authSession.findUnique({
    where: { id: session.user.authSessionId },
    include: { user: { select: { id: true, role: true, phone: true, phoneVerifiedAt: true, orgId: true, org: { select: { deletedAt: true } } } } },
  });
  const now = new Date();
  if (!record || record.userId !== session.user.id || !isActiveSessionRecord(record, session.user.id, now) || record.user.role !== "ORG_USER" || !record.user.phone || !record.user.phoneVerifiedAt || !record.user.orgId || record.user.org?.deletedAt) return null;

  const isMobile = prefersMobileAuthFlow(await headers());
  if (!record.mobileLockEnabled && isMobile) {
    const enabled = await prisma.authSession.updateMany({ where: { id: record.id, userId: record.userId, mobileLockEnabled: false, revokedAt: null, expiresAt: { gt: now }, lastUsedAt: record.lastUsedAt }, data: { mobileLockEnabled: true } });
    if (enabled.count === 1) record.mobileLockEnabled = true;
    else return null;
  }
  if (!record.mobileLockEnabled) return null;
  return {
    userId: record.userId,
    sessionId: record.id,
    phone: record.user.phone,
    phoneVerifiedAt: record.user.phoneVerifiedAt,
    lastUsedAt: record.lastUsedAt,
    expiresAt: record.expiresAt,
  } satisfies MobileLockContext;
}

export async function getMobileLockState() {
  const context = await getMobileLockContext({ allowLockedSession: true });
  if (!context) return null;
  const now = new Date();
  return {
    locked: isMobileAppSessionIdle(context.lastUsedAt, now),
    idleTimeoutMs: MOBILE_APP_LOCK_IDLE_MS,
    lastActivityAt: context.lastUsedAt.toISOString(),
    expiresAt: context.expiresAt.toISOString(),
  };
}

export async function markMobileLockActivity(context: MobileLockContext) {
  const now = new Date();
  if (isMobileAppSessionIdle(context.lastUsedAt, now)) return false;
  const updated = await prisma.authSession.updateMany({
    where: { id: context.sessionId, userId: context.userId, mobileLockEnabled: true, revokedAt: null, expiresAt: { gt: now }, lastUsedAt: context.lastUsedAt },
    data: { lastUsedAt: now },
  });
  return updated.count === 1;
}

export async function lockMobileSessionNow(context: MobileLockContext) {
  const now = new Date();
  const updated = await prisma.authSession.updateMany({
    where: { id: context.sessionId, userId: context.userId, mobileLockEnabled: true, revokedAt: null, expiresAt: { gt: now } },
    data: { lastUsedAt: mobileAppLockTimestamp(now) },
  });
  return updated.count === 1;
}

export async function enableMobileLockForExistingSession(input: { userId: string; sessionId: string; role: string }) {
  if (input.role !== "ORG_USER" || !prefersMobileAuthFlow(await headers())) return;
  const now = new Date();
  const marked = await prisma.authSession.updateMany({
    where: { id: input.sessionId, userId: input.userId, mobileLockEnabled: false, revokedAt: null, expiresAt: { gt: now } },
    data: { mobileLockEnabled: true },
  });
  if (marked.count === 1) {
    const record = await prisma.authSession.findUnique({ where: { id: input.sessionId }, select: { lastUsedAt: true, revokedAt: true, expiresAt: true } });
    const checkedAt = new Date();
    if (record && !record.revokedAt && record.expiresAt > checkedAt && isMobileAppSessionIdle(record.lastUsedAt, checkedAt)) throw new MobileAppSessionLockedError();
  }
}