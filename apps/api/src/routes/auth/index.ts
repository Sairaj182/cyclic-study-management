import type { FastifyInstance } from "fastify";

import { customRoutes } from "./custom";
import { betterAuthRoutes } from "./better-auth";

export async function authRoutes(app: FastifyInstance) {
  app.register(customRoutes);
  app.register(betterAuthRoutes);
}
