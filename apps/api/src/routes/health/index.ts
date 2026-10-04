import type { FastifyInstance } from "fastify";
import { prisma } from "@repo/database";
import { env } from "../../env";

function maskSecret(val: string | undefined): string {
  if (!val) return "missing";
  if (val.length <= 12) return "configured (too short to mask)";
  return `${val.substring(0, 6)}...${val.substring(val.length - 6)} (length: ${val.length})`;
}

function maskDatabaseUrl(url: string | undefined): string {
  if (!url) return "missing";
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//*****:*****@${parsed.host}${parsed.pathname}${parsed.search || ""}`;
  } catch {
    return "configured (invalid URL format)";
  }
}

export async function healthRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    let dbStatus = "unknown";
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = "connected";
    } catch (err: any) {
      dbStatus = `disconnected: ${err.message || err}`;
    }

    return {
      status: dbStatus === "connected" ? "ok" : "degraded",
      service: "csm-api",
      timestamp: new Date().toISOString(),
      database: dbStatus,
      config: {
        NODE_ENV: env.NODE_ENV,
        PORT: env.API_PORT,
        HOST: env.HOST,
        BETTER_AUTH_URL: env.BETTER_AUTH_URL,
        CORS_ORIGIN: env.CORS_ORIGIN,
        DATABASE_URL: maskDatabaseUrl(process.env.DATABASE_URL),
        JWT_SECRET: maskSecret(env.JWT_SECRET),
        BETTER_AUTH_SECRET: maskSecret(env.BETTER_AUTH_SECRET),
      },
    };
  });
}
