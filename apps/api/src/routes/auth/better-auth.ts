import type { FastifyInstance } from "fastify";
import { toNodeHandler } from "better-auth/node";

import { auth } from "@repo/auth/server";

const handler = toNodeHandler(auth);

export async function betterAuthRoutes(app: FastifyInstance) {
  // Prevent Fastify from consuming the request body -
  // BetterAuth needs to read the raw Node stream itself.
  app.removeAllContentTypeParsers();
  app.addContentTypeParser("*", function (_request, _payload, done) {
    done(null);
  });

  app.all("/*", async (request, reply) => {
    // Copy headers set by Fastify (like CORS) to the raw Node response
    for (const [key, value] of Object.entries(reply.getHeaders())) {
      if (value !== undefined) {
        reply.raw.setHeader(key, value as any);
      }
    }

    reply.hijack();
    try {
      await handler(request.raw, reply.raw);
    } catch (err) {
      console.error("BetterAuth error:");
      console.error(err);
      throw err;
    }
    return;
  });
}
