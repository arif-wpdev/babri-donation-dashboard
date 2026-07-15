import type { NextAuthConfig } from "next-auth";
import type { Role } from "@prisma/client";

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
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
