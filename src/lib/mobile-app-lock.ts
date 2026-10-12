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

export async function getMobileLockContext(options: { allowLockedSession?: boolean } = {}): Promise<MobileLockContext | null> {
  return null;
}

export async function getMobileLockState() {
  return {
    locked: false,
    idleTimeoutMs: 0,
    lastActivityAt: new Date().toISOString(),
    expiresAt: new Date().toISOString(),
  };
}

export async function markMobileLockActivity(context: MobileLockContext) {
  return true;
}

export async function lockMobileSessionNow(context: MobileLockContext) {
  return true;
}

export async function enableMobileLockForExistingSession(input: { userId: string; sessionId: string; role: string }) {
  // Mobile auto-lock disabled per user request
  return;
}