import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Do NOT set `output: "standalone"`.
   *
   * That mode makes Next.js emit a self-hosted `standalone/server.js` entry
   * point. Vercel runs the app as a serverless function and never starts that
   * file, so every server-rendered route (/, /login, /api/*) returned
   * 404 NOT_FOUND even though the build reported Ready and static assets in
   * public/ were served fine.
   *
   * It is only needed for Docker or a long-running Node server, not Vercel.
   */
  serverExternalPackages: ["@prisma/client", "bcryptjs"],
};

export default nextConfig;
