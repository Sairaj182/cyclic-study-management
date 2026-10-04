import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health";



export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoutes, { prefix: "/api" });
}

