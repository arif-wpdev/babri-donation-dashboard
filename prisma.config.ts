// Prisma 7 configuration — URLs must be defined here, NOT in schema.prisma
// See: https://pris.ly/d/config-datasource
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    /**
     * Only needed by commands that touch the database (migrate, db push, db
     * seed). `prisma generate` — which npm runs as postinstall on Vercel —
     * does not read this, and it runs before any .env file exists in that
     * environment. Supplying a harmless placeholder there keeps the build
     * green; real commands still use the real value from the environment.
     */
    url:
      process.env["DIRECT_URL"] ??
      process.env["DATABASE_URL"] ??
      "postgresql://user:password@localhost:5432/placeholder",
  },
});
