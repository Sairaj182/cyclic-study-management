import Fastify from "fastify";
import fastifyCookie from "@fastify/cookie";
import fastifyCors from "@fastify/cors";
import fastifyJwt from "@fastify/jwt";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyHelmet from "@fastify/helmet";
import { env } from "./env";
import { registerRoutes } from "./routes";



export function buildApp() {
  const app = Fastify({
    logger: { level: env.NODE_ENV === "production" ? "info" : "debug" },
    trustProxy: true,
  });

  app.register(fastifyCors, {
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  });
  app.register(fastifyHelmet);

  app.register(fastifyCookie);

  app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    cookie: { cookieName: "auth_token", signed: false },
  });


  // Global registration only - `global: false` means no route is limited
  // unless it opts in via `{ config: { rateLimit: {...} } }`.
  app.register(fastifyRateLimit, { global: false });

  registerRoutes(app);

  return app;
}
