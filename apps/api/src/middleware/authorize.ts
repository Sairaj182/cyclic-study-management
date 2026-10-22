import { prisma } from "@repo/database";
import type { FastifyRequest, FastifyReply } from "fastify";


export function authorizeSuperAdmin() {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = (request as any).user;

    if (!user) {
      return reply.status(401).send({ error: "Unauthorized" });
    }

    const admin = await prisma.user.findUnique({
        where: {
            id: user.id,
        },
        select: {
            isSuperAdmin: true,
        },
    });

    if (!admin?.isSuperAdmin) {
    return reply
        .status(403)
        .send({ error: "Forbidden: Missing required permissions" });
    }
    
  };
}
