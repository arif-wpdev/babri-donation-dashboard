import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables — never exposed to the browser
   */
  server: {
    DATABASE_URL: z.string().url(),
    DIRECT_URL: z.string().url(),
    AUTH_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex-encoded
    CRON_SECRET: z.string().min(16),
    SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
    SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
  },

  /**
   * Client-side environment variables — safe to expose to the browser
   */
  client: {
    /**
     * The public base URL of this deployment, e.g. https://example.com
     *
     * Optional on purpose: nothing in the app reads it, and making it
     * required meant a Vercel build failed whenever the value was missing
     * or scoped to the wrong environment. Set it if a future feature needs
     * an absolute URL; nothing breaks while it is absent.
     */
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  },

  /**
   * Destructuring of process.env for Next.js
   */
  runtimeEnv: {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SEED_SUPER_ADMIN_EMAIL: process.env.SEED_SUPER_ADMIN_EMAIL,
    SEED_SUPER_ADMIN_PASSWORD: process.env.SEED_SUPER_ADMIN_PASSWORD,
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  },

  /**
   * Skip validation in CI environments that don't have all env vars set
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,

  /**
   * Empty strings treated as undefined
   */
  emptyStringAsUndefined: true,
});
