import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Server-side environment variables — never exposed to the browser
   */
  server: {
    /**
     * Optional when the DB_* parts below are supplied instead. Some hosts
     * (Vercel) corrupt percent-encoded values, so a password containing `$`
     * or `^` can arrive mangled and Prisma reports "the provided database
     * credentials are not valid". The DB_* path avoids URL encoding entirely.
     */
    DATABASE_URL: z.string().url().optional(),
    DIRECT_URL: z.string().url(),
    /**
     * Alternative to DATABASE_URL for hosts that mangle percent-encoded
     * values. Supplying these avoids putting a password with `$` or `^` in a
     * URL at all. Used only when DATABASE_URL is absent.
     */
    DB_URL: z.string().optional(),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_NAME: z.string().optional(),
    AUTH_SECRET: z.string().min(32),
    ENCRYPTION_KEY: z.string().length(64), // 32 bytes hex-encoded
    CRON_SECRET: z.string().min(16),
    SEED_SUPER_ADMIN_EMAIL: z.string().email().optional(),
    SEED_SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),
    AUTH_MFA_ENABLED: z.enum(["true", "false"]).default("false"),
    AUTH_APP_ORIGIN: z.string().url().optional(),
    AUTH_WEBAUTHN_RP_ID: z.string().optional(),
    AUTH_WEBAUTHN_RP_NAME: z.string().default("Donation Dashboard"),
    AUTH_OTP_HASH_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/).optional(),
    AUTH_RATE_LIMIT_HMAC_KEY: z.string().min(32).optional(),
    AUTH_MFA_CONFIGURED: z.enum(["true", "false"]).default("false"),
    // Optional timing-hardening hash. Invalid/blank values are ignored by auth code
    // rather than preventing the entire app from starting.
    AUTH_DUMMY_PASSWORD_HASH: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_TLS_SERVERNAME: z.string().optional(),
    GREENWEB_SMS_TOKEN: z.string().min(16).optional(),
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
    DB_URL: process.env.DB_URL,
    DB_USER: process.env.DB_USER,
    DB_PASSWORD: process.env.DB_PASSWORD,
    DB_NAME: process.env.DB_NAME,
    AUTH_SECRET: process.env.AUTH_SECRET,
    ENCRYPTION_KEY: process.env.ENCRYPTION_KEY,
    CRON_SECRET: process.env.CRON_SECRET,
    SEED_SUPER_ADMIN_EMAIL: process.env.SEED_SUPER_ADMIN_EMAIL,
    SEED_SUPER_ADMIN_PASSWORD: process.env.SEED_SUPER_ADMIN_PASSWORD,
    AUTH_MFA_ENABLED: process.env.AUTH_MFA_ENABLED,
    AUTH_APP_ORIGIN: process.env.AUTH_APP_ORIGIN,
    AUTH_WEBAUTHN_RP_ID: process.env.AUTH_WEBAUTHN_RP_ID,
    AUTH_WEBAUTHN_RP_NAME: process.env.AUTH_WEBAUTHN_RP_NAME,
    AUTH_OTP_HASH_KEY: process.env.AUTH_OTP_HASH_KEY,
    AUTH_RATE_LIMIT_HMAC_KEY: process.env.AUTH_RATE_LIMIT_HMAC_KEY,
    AUTH_MFA_CONFIGURED: process.env.AUTH_MFA_CONFIGURED,
    AUTH_DUMMY_PASSWORD_HASH: process.env.AUTH_DUMMY_PASSWORD_HASH,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_TLS_SERVERNAME: process.env.SMTP_TLS_SERVERNAME,
    GREENWEB_SMS_TOKEN: process.env.GREENWEB_SMS_TOKEN,
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
