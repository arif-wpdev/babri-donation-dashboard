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
// Lazy factory — creates the Prisma client with a pg adapter
// ─────────────────────────────────────────────────────────────────────────────

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not defined. Please set it in .env.local"
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
