import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Role } from "@prisma/client";
import { authConfig } from "@/auth.config";

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
    };
  }

  interface User {
    role: Role;
    orgId: string | null;
    orgSlug: string | null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Validation schema for credentials
// ─────────────────────────────────────────────────────────────────────────────
const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

// ─────────────────────────────────────────────────────────────────────────────
// NextAuth v5 configuration
// ─────────────────────────────────────────────────────────────────────────────
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },

  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      async authorize(credentials) {
        // Validate input shape
        const parsed = credentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;

        // Fetch user from DB
        const user = await prisma.user.findUnique({
          where: { email },
          include: { org: { select: { id: true, slug: true } } },
        });

        if (!user || !user.passwordHash) return null;

        // Constant-time password comparison
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          role: user.role,
          orgId: user.org?.id ?? null,
          orgSlug: user.org?.slug ?? null,
        };
      },
    }),
  ],
});
