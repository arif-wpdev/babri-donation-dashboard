/**
 * Prisma 7 Client Singleton
 *
 * Since Prisma 7, the client requires a Driver Adapter — the connection URL
 * is no longer passed in the schema.prisma datasource block.
 * We use @prisma/adapter-pg with the standard 'pg' Pool.
 *
 * References:
 *  - https://pris.ly/d/prisma7-client-config
 *  - https://pris.ly/d/config-datasource
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// ─────────────────────────────────────────────────────────────────────────────
// Connection string resolution
//
// Prefer a full DATABASE_URL when it is present. But some hosts (Vercel) mangle
// percent-encoded values, so a password containing `$` or `^` can reach us
// corrupted and Prisma reports "the provided database credentials are not
// valid" even though the same string works locally.
//
// DB_* parts let a deployment supply the password verbatim, with no URL
// encoding involved at all. They are only consulted when DATABASE_URL is
// absent or unusable.
// ─────────────────────────────────────────────────────────────────────────────

function buildFromParts(): string | undefined {
  const url = process.env.DB_URL;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const database = process.env.DB_NAME;

  if (!url || !user || !password || !database) return undefined;

  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${url}/${database}`;
}

function resolveConnectionString(): string | undefined {
  const direct = process.env.DATABASE_URL;
  if (direct) return direct;

  return (
    buildFromParts() ??
    (process.env.SKIP_ENV_VALIDATION
      ? "postgresql://dummy:dummy@localhost:5432/dummy"
      : undefined)
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Lazy factory — creates the Prisma client with a pg adapter
// ─────────────────────────────────────────────────────────────────────────────

function createPrismaClient() {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not defined. Set it in .env.local, or provide DB_URL, DB_USER, DB_PASSWORD and DB_NAME"
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Singleton — prevents multiple instances during Next.js dev HMR
// ─────────────────────────────────────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createPrismaClient> | undefined;
};

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
