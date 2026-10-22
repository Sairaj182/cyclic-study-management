import type { FastifyRequest, FastifyReply } from "fastify";
import { auth } from "@repo/auth/server";
import { prisma } from "@repo/database";

export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const webHeaders = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        webHeaders.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => webHeaders.append(key, v));
      }
    }

    const session = await auth.api.getSession({
      headers: webHeaders,
    });

    request.log.info(
      {
        hasSession: !!session,
        userId: session?.user?.id,
      },
      "[requireAuth] session verification result",
    );

    if (!session || !session.user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const account = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { banned: true },
    });
    if (account?.banned) {
      return reply.status(403).send({ error: "Account is suspended" });
    }

    // Attach user and session to request
    (request as any).user = session.user;
    (request as any).session = session.session;
  } catch (error: any) {
    request.log.error(error, "[requireAuth] error verifying session");
    return reply.status(401).send({ error: "Unauthorized" });
  }
}

export async function optionalAuth(
  request: FastifyRequest,
  reply: FastifyReply,
) {
  try {
    const webHeaders = new Headers();
    for (const [key, value] of Object.entries(request.headers)) {
      if (typeof value === "string") {
        webHeaders.append(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => webHeaders.append(key, v));
      }
    }

    const session = await auth.api.getSession({
      headers: webHeaders,
    });

    if (session && session.user) {
      (request as any).user = session.user;
      (request as any).session = session.session;
    }
  } catch (error: any) {
    // Ignore errors for optional auth
  }
}
