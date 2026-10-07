import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const authConfig = {
  providers: [],
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * Embed role, orgId, orgSlug into the JWT on first sign-in.
     * On subsequent requests, the token is read from the cookie — no DB hit.
     */
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.orgId = user.orgId;
        token.orgSlug = user.orgSlug;
        token.authSessionId = user.authSessionId ?? null;
        token.mfaVerifiedAt = user.mfaVerifiedAt ?? null;
        const account = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordChangedAt: true } });
        token.passwordChangedAt = account?.passwordChangedAt.getTime() ?? 0;
      } else if (token.id) {
        const [account, authSession] = await Promise.all([
          prisma.user.findUnique({ where: { id: token.id as string }, select: { passwordChangedAt: true } }),
          token.authSessionId ? prisma.authSession.findUnique({ where: { id: token.authSessionId as string }, select: { userId: true, expiresAt: true, revokedAt: true } }) : Promise.resolve(null),
        ]);
        if (!account || account.passwordChangedAt.getTime() !== token.passwordChangedAt) return null;
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
