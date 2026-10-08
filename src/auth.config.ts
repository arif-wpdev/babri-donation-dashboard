import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { canAuthenticateAccount, hasMatchingAuthAccountClaims } from "@/lib/auth-session-policy";

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
    * Embed role/org claims on sign-in and validate them against the current
    * account on subsequent requests so stale tenant claims cannot authorize.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.orgId = user.orgId;
        token.orgSlug = user.orgSlug;
        token.authSessionId = user.authSessionId ?? null;
        token.mfaVerifiedAt = user.mfaVerifiedAt ?? null;
        const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordChangedAt: true, disabledAt: true, role: true, orgId: true, org: { select: { slug: true, deletedAt: true } } } });
        if (!account || !canAuthenticateAccount({ role: account.role, disabledAt: account.disabledAt, organizationActive: !account.org?.deletedAt }) || !hasMatchingAuthAccountClaims({ tokenRole: user.role, tokenOrgId: user.orgId, accountRole: account.role, accountOrgId: account.orgId })) return null;
        token.role = account.role;
        token.orgId = account.orgId;
        token.orgSlug = account.org?.slug ?? null;
        token.passwordChangedAt = account?.passwordChangedAt.getTime() ?? 0;
      } else if (token.id) {
        const [account, authSession] = await Promise.all([
          prisma.user.findUnique({ where: { id: token.id as string }, select: { passwordChangedAt: true, disabledAt: true, role: true, orgId: true, org: { select: { slug: true, deletedAt: true } } } }),
          token.authSessionId ? prisma.authSession.findUnique({ where: { id: token.authSessionId as string }, select: { userId: true, expiresAt: true, revokedAt: true } }) : Promise.resolve(null),
        ]);
        if (!account || !canAuthenticateAccount({ role: account.role, disabledAt: account.disabledAt, organizationActive: !account.org?.deletedAt }) || !hasMatchingAuthAccountClaims({ tokenRole: token.role as string | undefined, tokenOrgId: token.orgId as string | null | undefined, accountRole: account.role, accountOrgId: account.orgId }) || account.passwordChangedAt.getTime() !== token.passwordChangedAt) return null;
        token.orgSlug = account.org?.slug ?? null;
        if (token.authSessionId && (!authSession || authSession.userId !== token.id || authSession.revokedAt || authSession.expiresAt <= new Date())) return null;
        if (!token.authSessionId && process.env.AUTH_MFA_ENABLED === "true") return null;
      }
      return token;
    },

    /**
     * Expose the JWT claims on the session object consumed by client components.
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as Role;
        session.user.orgId = (token.orgId as string | null) ?? null;
        session.user.orgSlug = (token.orgSlug as string | null) ?? null;
        session.user.authSessionId = (token.authSessionId as string | null) ?? null;
        session.user.mfaVerifiedAt = (token.mfaVerifiedAt as number | null) ?? null;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
