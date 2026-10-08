import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";
import { createHash } from "node:crypto";
import { enforceRateLimits, hashAuthValue, isMfaConfigurationReady, normalizeIdentifier, requestIp, writeSecurityEvent } from "@/lib/auth-security";
import { headers } from "next/headers";
import { env } from "@/env";
import { canAuthenticateAccount, canCompletePasswordlessAdminEnrollment, canEmployeeCompleteEnrollmentLogin, canEmployeeReceiveSession, isEmployeeFirstPasskeyTicket, isLoginTicketCurrent, isPasswordlessAdminFirstPasskeyTicket, isPhoneOnlyPasswordlessRole } from "@/lib/auth-session-policy";

// ─────────────────────────────────────────────────────────────────────────────
// Module augmentation — extend the built-in session/user types
// ─────────────────────────────────────────────────────────────────────────────
declare module "next-auth" {
  interface Session {
    user: {
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
  }

  interface User {
    role: Role;
    orgId: string | null;
    orgSlug: string | null;
    authSessionId?: string | null;
    mfaVerifiedAt?: number | null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schema for credentials
// ─────────────────────────────────────────────────────────────────────────────
const credentialsSchema = z.object({
  identifier: z.string().min(8).max(254),
  password: z.string().min(12),
  loginTicket: z.string().optional(),
});

// ─────────────────────────────────────────────────────────────────────────────
// NextAuth v5 configuration
// ─────────────────────────────────────────────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  useSecureCookies: process.env.NODE_ENV === "production",
  session: { strategy: "jwt", maxAge: 8 * 60 * 60, updateAge: 60 * 60 },
  jwt: { maxAge: 8 * 60 * 60 },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        identifier: { label: "Verified phone number", type: "tel" },
        password: { label: "Password", type: "password" },
        loginTicket: { label: "One-time login ticket", type: "text" },
        onboardingTicket: { label: "One-time employee onboarding ticket", type: "text" },
      },

      async authorize(credentials) {
        const mfaEnabled = env.AUTH_MFA_ENABLED === "true";
        const mfaReady = isMfaConfigurationReady();
        const isEmployeeOnboardingHandoff = typeof credentials?.onboardingTicket === "string";
        if (mfaEnabled && !mfaReady && !isEmployeeOnboardingHandoff) return null;
        if (mfaEnabled || credentials?.loginTicket || isEmployeeOnboardingHandoff) {
          if (!mfaEnabled && !isEmployeeOnboardingHandoff) return null;
          const ticketValue = z.string().min(32).safeParse(isEmployeeOnboardingHandoff ? credentials?.onboardingTicket : credentials?.loginTicket);
          if (!ticketValue.success) return null;
          const tokenHash = createHash("sha256").update(ticketValue.data).digest("hex");
          const ticket = await prisma.loginTicket.findUnique({ where: { tokenHash } });
          if (!ticket || ticket.expiresAt <= new Date() || ticket.consumedAt) return null;
          const user = await prisma.user.findUnique({ where: { id: ticket.userId }, include: { org: { select: { id: true, slug: true, deletedAt: true } } } });
          if (!user || !canAuthenticateAccount({ role: user.role, disabledAt: user.disabledAt, organizationActive: !user.org?.deletedAt })) return null;
          const preAuth = ticket.preauthId ? await prisma.loginPreAuth.findUnique({ where: { id: ticket.preauthId } }) : null;
          if (!preAuth || preAuth.userId !== user.id || preAuth.expiresAt <= new Date() || !preAuth.consumedAt) return null;
          const isEmployeeEnrollment = preAuth.deliveryChannel === "employee-enrollment" && preAuth.passkeyOnly && user.role === "ORG_USER";
          const isAdminEnrollment = preAuth.deliveryChannel === "employee-enrollment" && preAuth.passkeyOnly && user.role === "ORG_ADMIN";
          const isPasswordlessEnrollment = isEmployeeEnrollment || isAdminEnrollment;
          if (isEmployeeOnboardingHandoff !== isPasswordlessEnrollment) return null;
          if (isPasswordlessEnrollment) {
            if (isEmployeeEnrollment && !isEmployeeFirstPasskeyTicket({ role: user.role, phoneVerifiedAt: user.phoneVerifiedAt, preAuthMarker: preAuth.deliveryChannel, passkeyOnly: preAuth.passkeyOnly, preAuthConsumedAt: preAuth.consumedAt, preAuthExpiresAt: preAuth.expiresAt, now: new Date() })) return null;
            if (isAdminEnrollment && !isPasswordlessAdminFirstPasskeyTicket({ role: user.role, passwordHash: user.passwordHash, phoneVerifiedAt: user.phoneVerifiedAt, preAuthMarker: preAuth.deliveryChannel, passkeyOnly: preAuth.passkeyOnly, preAuthConsumedAt: preAuth.consumedAt, preAuthExpiresAt: preAuth.expiresAt, now: new Date() })) return null;
            const activePasskey = await prisma.webAuthnCredential.findFirst({ where: { userId: user.id, revokedAt: null }, select: { id: true } });
            const enrollmentLoginInput = {
              role: user.role,
              phoneVerifiedAt: user.phoneVerifiedAt,
              orgActive: Boolean(user.orgId) && !user.org?.deletedAt,
              enrollmentMarker: preAuth.deliveryChannel,
              passkeyOnly: preAuth.passkeyOnly,
              enrollmentConsumedAt: preAuth.consumedAt,
              enrollmentExpiresAt: preAuth.expiresAt,
              hasActivePasskey: Boolean(activePasskey),
              now: new Date(),
            };
            if (isEmployeeEnrollment && !canEmployeeCompleteEnrollmentLogin(enrollmentLoginInput)) return null;
            if (isAdminEnrollment && !canCompletePasswordlessAdminEnrollment({ ...enrollmentLoginInput, passwordHash: user.passwordHash })) return null;
          } else if (!canEmployeeReceiveSession({ role: user.role, phoneVerifiedAt: user.phoneVerifiedAt })) {
            return null;
          }
          const authSession = await prisma.$transaction(async (tx) => {
            const handoffAt = new Date();
            if (!isPasswordlessEnrollment) {
              const currentUser = await tx.user.findUnique({ where: { id: user.id }, select: { passwordChangedAt: true } });
              if (!isLoginTicketCurrent(currentUser?.passwordChangedAt ?? null, preAuth.createdAt)) return null;
            }
            const consumed = await tx.loginTicket.updateMany({ where: { id: ticket.id, tokenHash, expiresAt: { gt: handoffAt }, consumedAt: null }, data: { consumedAt: handoffAt } });
            if (consumed.count !== 1) return null;
            const mobileLockEnabled = user.role === "ORG_USER" && /android|iphone|ipod|ipad|mobile/i.test((await headers()).get("user-agent") ?? "");
            return tx.authSession.create({ data: { userId: user.id, expiresAt: new Date(handoffAt.getTime() + 8 * 60 * 60 * 1000), mobileLockEnabled } });
          }, { isolationLevel: "Serializable", maxWait: 5_000, timeout: 10_000 });
          if (!authSession) return null;
          await writeSecurityEvent({ userId: user.id, eventType: "LOGIN_SUCCESS", details: { method: "mfa" } });
          return { id: user.id, name: user.name, email: user.email, image: user.image, role: user.role, orgId: user.org?.id ?? null, orgSlug: user.org?.slug ?? null, authSessionId: authSession.id, mfaVerifiedAt: Date.now() };
        }

        // Validate input shape
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { identifier, password } = parsed.data;
        const normalized = normalizeIdentifier(identifier);
        if (!/^\+[1-9]\d{7,14}$/.test(normalized)) return null;
        const requestHeaders = await headers();
        const ip = requestIp(requestHeaders);
        const passwordRate = await enforceRateLimits([
          { key: `password-account:${hashAuthValue(normalized, "account")}`, limit: 10, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
          { key: `password-ip:${hashAuthValue(ip, "ip")}`, limit: 40, windowMs: 15 * 60_000, blockMs: 30 * 60_000 },
        ]);
        if (!passwordRate.allowed) return null;

        // Fetch user from DB
        const user = await prisma.user.findUnique({
          where: { phone: normalized },
          include: { org: { select: { id: true, slug: true, deletedAt: true } } },
        });

        if ((user && !canAuthenticateAccount({ role: user.role, disabledAt: user.disabledAt, organizationActive: !user.org?.deletedAt })) || (user && isPhoneOnlyPasswordlessRole(user.role) && user.passwordHash === null)) return null;

        if (!user?.passwordHash || user.org?.deletedAt || !user.phoneVerifiedAt || normalizeIdentifier(user.phone ?? "") !== normalized) {
          const dummyPasswordHash = env.AUTH_DUMMY_PASSWORD_HASH && /^\$2[aby]\$\d\d\$[./A-Za-z0-9]{53}$/.test(env.AUTH_DUMMY_PASSWORD_HASH)
            ? env.AUTH_DUMMY_PASSWORD_HASH
            : undefined;
          if (dummyPasswordHash) await bcrypt.compare(password, dummyPasswordHash);
          await writeSecurityEvent({ eventType: "PASSWORD_FAILURE", details: { knownAccount: false } });
          return null;
        }

        // Constant-time password comparison
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) {
          await writeSecurityEvent({ userId: user.id, eventType: "PASSWORD_FAILURE" });
          return null;
        }

        if (mfaEnabled) return null;
        if (env.AUTH_MFA_CONFIGURED === "true") return null;
        const authSession = await prisma.authSession.create({ data: { userId: user.id, expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000) } });
        await writeSecurityEvent({ userId: user.id, eventType: "LOGIN_SUCCESS", ip, userAgent: requestHeaders.get("user-agent"), details: { method: "password_only_rollout_disabled" } });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          orgId: user.org?.id ?? null,
          orgSlug: user.org?.slug ?? null,
          authSessionId: authSession.id,
          mfaVerifiedAt: null,
        };
      },
    }),
  ],
});
