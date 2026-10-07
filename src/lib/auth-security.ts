import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { env } from "@/env";
import { prisma } from "@/lib/prisma";
import { sendGreenwebOtp } from "@/lib/greenweb-sms";
import type { AuthEventType, Prisma, Role } from "@prisma/client";
import { cookies } from "next/headers";
import type { AuthenticatorDevice } from "@simplewebauthn/types";
import { canEmployeeFallbackToOtp, isActiveSessionRecord, isMobileAppSessionLocked, isValidWebAuthnOriginConfig } from "@/lib/auth-session-policy";

const otpHashSecret = () => env.AUTH_OTP_HASH_KEY || env.AUTH_SECRET;
const rateHashSecret = () => env.AUTH_RATE_LIMIT_HMAC_KEY || env.AUTH_SECRET;
export const OTP_VALIDITY_MS = 5 * 60_000;
export const OTP_RESEND_INTERVAL_MS = 60_000;
export const OTP_MAX_FAILED_ATTEMPTS = 3;
export const OTP_LOCK_DURATION_MS = 24 * 60 * 60_000;

export function normalizeIdentifier(input: string) {
  const value = input.trim();
  if (value.includes("@")) return value.toLowerCase();
  const normalized = value.replace(/[\s().-]/g, "");
  if (normalized.startsWith("00")) return `+${normalized.slice(2)}`;
  if (normalized.startsWith("+")) return normalized;
  if (/^01[3-9]\d{8}$/.test(normalized)) return `+88${normalized}`;
  if (/^8801[3-9]\d{8}$/.test(normalized)) return `+${normalized}`;
  return normalized;
}

const sensitiveAuditKey = /(password|otp|token|secret|credential|authorization|code|email|phone|destination|identifier|cookie)/i;

export function sanitizeSecurityEventDetails(details: Record<string, string | number | boolean | null> | undefined) {
  if (!details) return undefined;
  const safe: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(details)) {
    if (sensitiveAuditKey.test(key)) continue;
    if (typeof value === "string") {
      const clean = value.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160);
      if (/(?:\+?\d[\d\s().-]{7,}\d|[^\s@]+@[^\s@]+\.[^\s@]+)/.test(clean)) continue;
      safe[key] = clean;
    } else {
      safe[key] = value;
    }
  }
  return Object.keys(safe).length ? safe : undefined;
}

export function hashAuthValue(value: string, purpose = "auth") {
  return createHmac("sha256", purpose === "otp" ? otpHashSecret() : rateHashSecret())
    .update(`${purpose}:${value}`)
    .digest("hex");
}

export function verifyOtpHash(storedHash: string, otp: string) {
  const actual = Buffer.from(hashAuthValue(otp, "otp"), "hex");
  const expected = Buffer.from(storedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

type OtpChallengeState = {
  otpHash?: string | null;
  otpExpiresAt?: Date | null;
  consumedAt?: Date | null;
  lockedUntil?: Date | null;
  failedAttempts: number;
  resendAfter?: Date | null;
};

export function getOtpRequestBlock(
  challenge: Pick<OtpChallengeState, "lockedUntil" | "resendAfter"> | null,
  now: Date,
) {
  if (challenge?.lockedUntil && challenge.lockedUntil > now) {
    return { reason: "locked" as const, retryAfterSeconds: Math.max(1, Math.ceil((challenge.lockedUntil.getTime() - now.getTime()) / 1000)) };
  }
  if (challenge?.resendAfter && challenge.resendAfter > now) {
    return { reason: "resend" as const, retryAfterSeconds: Math.max(1, Math.ceil((challenge.resendAfter.getTime() - now.getTime()) / 1000)) };
  }
  return null;
}

export function isOtpChallengeUsable(challenge: OtpChallengeState | null, now: Date, maxAttempts = 3) {
  return Boolean(
    challenge?.otpHash &&
    challenge.otpExpiresAt && challenge.otpExpiresAt > now &&
    !challenge.consumedAt &&
    (!challenge.lockedUntil || challenge.lockedUntil <= now) &&
    challenge.failedAttempts < maxAttempts,
  );
}

export function nextOtpFailure(failedAttempts: number, now: Date, maxAttempts = OTP_MAX_FAILED_ATTEMPTS, lockMs = OTP_LOCK_DURATION_MS) {
  const attempts = failedAttempts + 1;
  return {
    attempts,
    lockedUntil: attempts >= maxAttempts ? new Date(now.getTime() + lockMs) : null,
  };
}

export function evaluateRateLimit(input: {
  count: number;
  windowEnds: Date;
  blockedUntil?: Date | null;
  now: Date;
  limit: number;
  windowMs: number;
  blockMs?: number;
}) {
  if (input.blockedUntil && input.blockedUntil > input.now) {
    return {
      allowed: false,
      count: input.count,
      windowEnds: input.windowEnds,
      blockedUntil: input.blockedUntil,
      retryAfterSeconds: Math.max(1, Math.ceil((input.blockedUntil.getTime() - input.now.getTime()) / 1000)),
    };
  }
  const windowExpired = input.windowEnds <= input.now;
  const count = windowExpired ? 1 : input.count + 1;
  const windowEnds = windowExpired ? new Date(input.now.getTime() + input.windowMs) : input.windowEnds;
  if (count > input.limit) {
    const blockedUntil = new Date(input.now.getTime() + (input.blockMs ?? input.windowMs));
    return { allowed: false, count, windowEnds, blockedUntil, retryAfterSeconds: Math.max(1, Math.ceil((blockedUntil.getTime() - input.now.getTime()) / 1000)) };
  }
  return { allowed: true, count, windowEnds, blockedUntil: null, retryAfterSeconds: 0 };
}

export function isPasskeyChallengeUsable(challenge: { userId: string | null; challenge: string | null; otpExpiresAt: Date | null; consumedAt: Date | null } | null, userId: string, now: Date) {
  return Boolean(
    challenge &&
    challenge.userId === userId &&
    challenge.challenge &&
    challenge.otpExpiresAt &&
    challenge.otpExpiresAt > now &&
    !challenge.consumedAt,
  );
}

export function isCredentialTrustedForUser(input: {
  userId: string;
  credentialId: string;
  credentialUserId: string;
  trustedCredentialId: string;
  credentialRevokedAt: Date | null;
  trustedDeviceRevokedAt: Date | null;
}) {
  return input.userId === input.credentialUserId &&
    input.credentialId === input.trustedCredentialId &&
    input.credentialRevokedAt === null &&
    input.trustedDeviceRevokedAt === null;
}

export function isTrustedDeviceRecordUsable(input: {
  exists: boolean;
  userId: string;
  deviceUserId: string;
  credentialId: string;
  trustedCredentialId: string;
  credentialUserId: string;
  deviceRevokedAt: Date | null;
  credentialRevokedAt: Date | null;
  createdAt: Date;
  now: Date;
}) {
  return input.exists &&
    input.userId === input.deviceUserId &&
    input.userId === input.credentialUserId &&
    input.credentialId === input.trustedCredentialId &&
    input.deviceRevokedAt === null &&
    input.credentialRevokedAt === null &&
    input.createdAt.getTime() + 365 * 24 * 60 * 60_000 > input.now.getTime();
}


export function randomOtp() {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function requestIp(headers: Headers) {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && realIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(realIp)) return realIp;
  const platformIp = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim();
  if (platformIp && platformIp.length <= 64 && /^[0-9a-fA-F:.]+$/.test(platformIp)) return platformIp;
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded && forwarded.length <= 64 && /^[0-9a-fA-F:.]+$/.test(forwarded) ? forwarded : "unknown";
}

/** UX hint only; never grants trust without a server-validated credential. */
export function prefersMobileAuthFlow(headers: Headers) {
  if (headers.get("sec-ch-ua-mobile") === "?1") return true;
  return /android|iphone|ipod|ipad|mobile/i.test(headers.get("user-agent") ?? "");
}

export function ensureSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const configuredOrigin = env.AUTH_APP_ORIGIN;
  const requestOrigin = new URL(request.url).origin;
  const parsedOrigin = configuredOrigin ? new URL(configuredOrigin) : new URL(requestOrigin);
  if (parsedOrigin.pathname !== "/" || parsedOrigin.search || parsedOrigin.hash || parsedOrigin.username || parsedOrigin.password) throw new Error("Invalid configured origin");
  const expectedOrigin = parsedOrigin.origin;
  if (!origin || origin !== expectedOrigin) throw new Error("Invalid request origin");
}

export function webAuthnConfiguration(request?: Request) {
  const configuredOrigin = env.AUTH_APP_ORIGIN;
  const origin = configuredOrigin ? new URL(configuredOrigin).origin : request ? new URL(request.url).origin : null;
  if (!origin) throw new Error("Authentication origin is not configured");
  const parsed = new URL(origin);
  if (env.NODE_ENV === "production" && parsed.protocol !== "https:") throw new Error("Authentication origin must use HTTPS");
  if (parsed.pathname !== "/" || parsed.search || parsed.hash || parsed.username || parsed.password) throw new Error("Authentication origin must be a canonical origin");
  const rpID = env.AUTH_WEBAUTHN_RP_ID || parsed.hostname;
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/i.test(rpID)) throw new Error("Invalid WebAuthn RP ID");
  if (rpID !== parsed.hostname && !parsed.hostname.endsWith(`.${rpID}`)) throw new Error("WebAuthn RP ID must be the origin hostname or its parent domain");
  return { origin, rpID, rpName: env.AUTH_WEBAUTHN_RP_NAME };
}

/** Allows authenticated users to register passkeys before enabling MFA login. */
export function isWebAuthnConfigurationReady(request?: Request) {
  if (!isValidWebAuthnOriginConfig(env.AUTH_APP_ORIGIN, env.AUTH_WEBAUTHN_RP_ID, env.NODE_ENV === "production")) return false;
  try {
    const configured = webAuthnConfiguration(request);
    return configured.origin === new URL(env.AUTH_APP_ORIGIN!).origin;
  } catch {
    return false;
  }
}

export function isMfaConfigurationReady() {
  if (env.AUTH_MFA_ENABLED !== "true" || env.AUTH_MFA_CONFIGURED !== "true") return false;
  if (env.AUTH_SECRET.length < 32) return false;
  if (!env.AUTH_APP_ORIGIN || !env.AUTH_WEBAUTHN_RP_ID || !env.AUTH_OTP_HASH_KEY || !env.AUTH_RATE_LIMIT_HMAC_KEY) return false;
  if (!env.GREENWEB_SMS_TOKEN) return false;
  if (!/^[a-f0-9]{64}$/i.test(env.AUTH_OTP_HASH_KEY) || env.AUTH_OTP_HASH_KEY === env.AUTH_SECRET) return false;
  if (env.AUTH_RATE_LIMIT_HMAC_KEY.length < 32 || env.AUTH_RATE_LIMIT_HMAC_KEY === env.AUTH_SECRET || env.AUTH_RATE_LIMIT_HMAC_KEY === env.AUTH_OTP_HASH_KEY) return false;
  try {
    const origin = new URL(env.AUTH_APP_ORIGIN);
    if (origin.pathname !== "/" || origin.search || origin.hash || origin.username || origin.password) return false;
    if (env.NODE_ENV === "production" && origin.protocol !== "https:") return false;
    if (origin.hostname !== "localhost" && origin.hostname !== "127.0.0.1" && origin.hostname !== "[::1]" && origin.hostname.includes(":")) return false;
    if (env.AUTH_WEBAUTHN_RP_ID !== origin.hostname && !origin.hostname.endsWith(`.${env.AUTH_WEBAUTHN_RP_ID}`)) return false;
  } catch {
    return false;
  }
  return true;
}

export function isOtpDeliveryReady(channel: "sms") {
  return channel === "sms" && Boolean(env.GREENWEB_SMS_TOKEN);
}

export async function writeSecurityEvent(input: {
  userId?: string | null;
  eventType: AuthEventType;
  ip?: string;
  userAgent?: string | null;
  details?: Record<string, string | number | boolean | null>;
}) {
  try {
    await prisma.securityEvent.create({
      data: {
        userId: input.userId ?? null,
        eventType: input.eventType,
        ipHash: input.ip ? hashAuthValue(input.ip, "rate") : null,
        userAgent: input.userAgent?.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 512) ?? null,
        details: sanitizeSecurityEventDetails(input.details),
      },
    });
  } catch {
    // Audit records never contain credentials. Avoid leaking request data if storage is unavailable.
    console.error("[AUTH_AUDIT] Security event persistence failed");
  }
}

export async function enforceRateLimits(
  buckets: Array<{ key: string; limit: number; windowMs: number; blockMs?: number }>,
) {
  const now = new Date();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        for (const bucket of buckets) {
          const key = hashAuthValue(bucket.key, "rate");
          const record = await tx.authRateLimit.findUnique({ where: { key } });
          const decision = evaluateRateLimit({
            count: record?.count ?? 0,
            windowEnds: record?.windowEnds ?? now,
            blockedUntil: record?.blockedUntil,
            now,
            limit: bucket.limit,
            windowMs: bucket.windowMs,
            blockMs: bucket.blockMs,
          });
          if (!record) {
            await tx.authRateLimit.create({ data: { key, count: decision.count, windowEnds: decision.windowEnds, blockedUntil: decision.blockedUntil } });
          } else {
            await tx.authRateLimit.update({ where: { key }, data: { count: decision.count, windowEnds: decision.windowEnds, blockedUntil: decision.blockedUntil } });
          }
          if (!decision.allowed) return { allowed: false, retryAfterSeconds: decision.retryAfterSeconds };
        }
        return { allowed: true, retryAfterSeconds: 0 };
      }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
    } catch (error) {
      if (!(error && typeof error === "object" && "code" in error && error.code === "P2034") || attempt === 2) throw error;
    }
  }
  return { allowed: false, retryAfterSeconds: 60 };
}

export async function incrementFailedPasswordAttempts(identifier: string, ip: string) {
  return enforceRateLimits([
    { key: `password-account:${hashAuthValue(identifier, "account")}`, limit: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
    { key: `password-ip:${hashAuthValue(ip, "ip")}`, limit: 40, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
  ]);
}

export function makeAuthenticator(credential: { credentialId: string; publicKey: string; counter: bigint; transports: string[] }): AuthenticatorDevice {
  return {
    credentialID: Buffer.from(credential.credentialId, "base64url"),
    credentialPublicKey: Buffer.from(credential.publicKey, "base64url"),
    counter: Number(credential.counter),
    transports: credential.transports as AuthenticatorTransport[],
  };
}

export async function deliverOtp(destination: string, channel: "sms", otp: string) {
  if (channel !== "sms" || !env.GREENWEB_SMS_TOKEN) throw new Error("SMS OTP delivery is not configured");
  const message = `Your sign-in code is ${otp}. It expires in 5 minutes. If you did not request this code, ignore this message.`;
  await sendGreenwebOtp({ token: env.GREENWEB_SMS_TOKEN, recipient: destination, message });
}

const preAuthCookieName = process.env.NODE_ENV === "production" ? "__Host-auth-preauth" : "auth-preauth";
const trustedDeviceCookieName = process.env.NODE_ENV === "production" ? "__Host-auth-device" : "auth-device";

export async function issuePreAuth(userId: string, deliveryChannel?: "sms", passkeyOnly = false) {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const preAuth = await prisma.loginPreAuth.create({ data: { userId, tokenHash, expiresAt, deliveryChannel, passkeyOnly }, select: { id: true, tokenHash: true } });
  (await cookies()).set(preAuthCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  });
  return preAuth;
}

export async function rotateEmployeePasskeyPreAuthToOtp(input: { userId: string; preAuthId: string; preAuthTokenHash: string }) {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60_000);
  const created = await prisma.$transaction(async (tx) => {
    const current = await tx.loginPreAuth.findUnique({
      where: { id: input.preAuthId },
      include: { user: { select: { role: true, phoneVerifiedAt: true, orgId: true, org: { select: { deletedAt: true } } } } },
    });
    if (!current || current.userId !== input.userId || current.tokenHash !== input.preAuthTokenHash || current.consumedAt || current.expiresAt <= now || !canEmployeeFallbackToOtp({
      role: current.user.role,
      phoneVerifiedAt: current.user.phoneVerifiedAt,
      organizationActive: Boolean(current.user.orgId) && !current.user.org?.deletedAt,
      preAuthPasskeyOnly: current.passkeyOnly,
      deliveryChannel: current.deliveryChannel,
    })) throw new Error("Passkey fallback is no longer available");

    const claimed = await tx.loginPreAuth.updateMany({ where: { id: current.id, userId: input.userId, tokenHash: input.preAuthTokenHash, consumedAt: null, expiresAt: { gt: now }, passkeyOnly: true, deliveryChannel: "sms" }, data: { consumedAt: now } });
    if (claimed.count !== 1) throw new Error("Passkey fallback was already used");
    const challengeKey = hashAuthValue(input.preAuthTokenHash, "passkey-auth");
    await tx.authChallenge.updateMany({ where: { identifierHash: challengeKey, type: "PASSKEY_AUTHENTICATION", userId: input.userId, consumedAt: null }, data: { consumedAt: now } });
    return tx.loginPreAuth.create({ data: { userId: input.userId, tokenHash, expiresAt, deliveryChannel: "sms", passkeyOnly: false }, select: { id: true } });
  }, { isolationLevel: "Serializable", maxWait: 3_000, timeout: 5_000 });
  (await cookies()).set(preAuthCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 10 * 60,
  });
  return created.id;
}

export async function issueTrustedDeviceInTransaction(userId: string, credentialId: string, tx: Prisma.TransactionClient) {
  const { randomBytes } = await import("node:crypto");
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  await tx.trustedDevice.create({ data: { userId, credentialId, tokenHash } });
  (await cookies()).set(trustedDeviceCookieName, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 365 * 24 * 60 * 60,
  });
}

export async function getPreAuthUser() {
  const cookieValue = (await cookies()).get(preAuthCookieName)?.value;
  if (!cookieValue) return null;
  const preAuth = await prisma.loginPreAuth.findUnique({
    where: { tokenHash: createHash("sha256").update(cookieValue).digest("hex") },
    include: { user: true },
  });
  if (!preAuth || preAuth.expiresAt <= new Date() || preAuth.consumedAt) return null;
  return { preAuth, user: preAuth.user };
}

export async function clearPreAuth() {
  (await cookies()).delete(preAuthCookieName);
}

export async function getTrustedDeviceCredential(userId: string) {
  const token = (await cookies()).get(trustedDeviceCookieName)?.value;
  if (!token) return null;
  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { credential: true },
  });
  if (!isTrustedDeviceRecordUsable({
    exists: Boolean(device),
    userId,
    deviceUserId: device?.userId ?? "",
    credentialId: device?.credentialId ?? "",
    trustedCredentialId: device?.credential.credentialId ?? "",
    credentialUserId: device?.credential.userId ?? "",
    deviceRevokedAt: device?.revokedAt ?? null,
    credentialRevokedAt: device?.credential.revokedAt ?? null,
    createdAt: device?.createdAt ?? new Date(0),
    now: new Date(),
  })) return null;
  return device;
}

export async function getTrustedDeviceCredentialForLogin(userId: string) {
  const token = (await cookies()).get(trustedDeviceCookieName)?.value;
  if (!token) return null;
  const device = await prisma.trustedDevice.findUnique({
    where: { tokenHash: createHash("sha256").update(token).digest("hex") },
    include: { credential: true },
  });
  if (isTrustedDeviceRecordUsable({
    exists: Boolean(device),
    userId,
    deviceUserId: device?.userId ?? "",
    credentialId: device?.credentialId ?? "",
    trustedCredentialId: device?.credential.credentialId ?? "",
    credentialUserId: device?.credential.userId ?? "",
    deviceRevokedAt: device?.revokedAt ?? null,
    credentialRevokedAt: device?.credential.revokedAt ?? null,
    createdAt: device?.createdAt ?? new Date(0),
    now: new Date(),
  })) return device;
  if (device && device.userId === userId) await clearTrustedDevice();
  return null;
}

export async function clearTrustedDevice() {
  (await cookies()).delete(trustedDeviceCookieName);
}

export async function trustedDeviceTokenHash() {
  const token = (await cookies()).get(trustedDeviceCookieName)?.value;
  return token ? createHash("sha256").update(token).digest("hex") : null;
}

export async function deleteCookie(name: string) {
  (await cookies()).delete(name);
}

export class MobileAppSessionLockedError extends Error {
  constructor() {
    super("Mobile app session is locked");
    this.name = "MobileAppSessionLockedError";
  }
}

export class MobileAppSessionUnlockRequiredError extends Error {
  constructor() {
    super("Mobile app session requires unlock");
    this.name = "MobileAppSessionUnlockRequiredError";
  }
}

export type StrongSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  role: Role;
  orgId: string | null;
  orgSlug: string | null;
  authSessionId: string | null;
  mfaVerifiedAt: number | null;
};

export async function requireStrongSession(user: StrongSessionUser) {
  if (!user) throw new Error("Unauthorized");
  if (!user.authSessionId) {
    if (env.AUTH_MFA_ENABLED === "true") throw new Error("Unauthorized");
    const legacyUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, role: true, orgId: true, org: { select: { slug: true, deletedAt: true } } } });
    if (!legacyUser || legacyUser.org?.deletedAt) throw new Error("Unauthorized");
    return { ...user, name: legacyUser.name, email: legacyUser.email, role: legacyUser.role, orgId: legacyUser.orgId, orgSlug: legacyUser.org?.slug ?? null };
  }
  if (env.AUTH_MFA_ENABLED === "true" && !user.mfaVerifiedAt) throw new Error("Unauthorized");
  const [record, account] = await Promise.all([
    prisma.authSession.findUnique({ where: { id: user.authSessionId }, select: { userId: true, expiresAt: true, revokedAt: true, lastUsedAt: true, mobileLockEnabled: true } }),
    prisma.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, email: true, role: true, orgId: true, org: { select: { slug: true, deletedAt: true } } } }),
  ]);
  if (!record || !isActiveSessionRecord(record, user.id, new Date())) throw new Error("Unauthorized");
  if (!account || account.org?.deletedAt) throw new Error("Unauthorized");
  if (account.role !== user.role || account.orgId !== user.orgId) throw new Error("Unauthorized");
  const now = new Date();
  if (isMobileAppSessionLocked({ role: account.role, lockEnabled: record.mobileLockEnabled, lastUsedAt: record.lastUsedAt, now })) throw new MobileAppSessionLockedError();
  if (!record.mobileLockEnabled) {
    const touch = await prisma.authSession.updateMany({ where: { id: user.authSessionId, userId: user.id, revokedAt: null, expiresAt: { gt: now }, mobileLockEnabled: false, lastUsedAt: record.lastUsedAt }, data: { lastUsedAt: now } });
    if (touch.count !== 1) {
      const latest = await prisma.authSession.findUnique({ where: { id: user.authSessionId }, select: { userId: true, expiresAt: true, revokedAt: true, lastUsedAt: true, mobileLockEnabled: true } });
      if (!latest || !isActiveSessionRecord(latest, user.id, new Date())) throw new Error("Unauthorized");
      if (isMobileAppSessionLocked({ role: account.role, lockEnabled: latest.mobileLockEnabled, lastUsedAt: latest.lastUsedAt, now: new Date() })) throw new MobileAppSessionLockedError();
      throw new Error("Session state changed; retry the request");
    }
  }
  return { ...user, name: account.name, email: account.email, role: account.role, orgId: account.orgId, orgSlug: account.org?.slug ?? null };
}


