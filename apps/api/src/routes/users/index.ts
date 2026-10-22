import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@repo/database";
import { requireAuth } from "../../middleware/auth";
import { scrypt, randomBytes } from "node:crypto";
import { authorizeSuperAdmin } from "../../middleware/authorize";

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize("NFKC"),
      salt,
      64,
      { N: 16384, r: 16, p: 1, maxmem: 128 * 16384 * 16 * 2 },
      (err, key) => {
        if (err) reject(err);
        else resolve(`${salt}:${key.toString("hex")}`);
      },
    );
  });
}

const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(6).optional(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phoneNumber: z.string().min(6).optional(),
});

const changePasswordSchema = z.object({
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

const banUserSchema = z.object({
  reason: z.string().min(1).optional(),
});

const listUsersSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  banned: z.enum(["true", "false"]).optional(),
});

export async function usersRoutes(app: FastifyInstance) {
  // GET /api/users/me - current user 
  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;

    return reply.send({
      user,
    });
  });

  // GET /api/users/me/sessions - list current user's active sessions
  app.get(
    "/me/sessions",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = (request as any).user;
      const currentSession = (request as any).session;

      const sessions = await prisma.session.findMany({
        where: { userId: user.id, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          createdAt: true,
          updatedAt: true,
          ipAddress: true,
          userAgent: true,
          expiresAt: true,
        },
      });

      return reply.send({
        sessions,
        currentSessionId: currentSession?.id ?? null,
      });
    },
  );

  // DELETE /api/users/me/sessions/others - revoke all sessions except current
  app.delete(
    "/me/sessions/others",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = (request as any).user;
      const currentSession = (request as any).session;

      await prisma.session.deleteMany({
        where: {
          userId: user.id,
          id: { not: currentSession?.id },
        },
      });

      return reply.send({ success: true });
    },
  );

  // DELETE /api/users/me/sessions/:sessionId - revoke a specific session
  app.delete(
    "/me/sessions/:sessionId",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = (request as any).user;
      const { sessionId } = request.params as { sessionId: string };

      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId: user.id },
      });

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      await prisma.session.delete({ where: { id: sessionId } });

      return reply.send({ success: true });
    },
  );

  // POST /api/users - admin creates a new user
  app.post(
    "/",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const data = createUserSchema.safeParse(request.body);
      if (!data.success) {
        return reply.status(400).send({ error: data.error.flatten() });
      }
      if (!data.data.email) {
        return reply
          .status(400)
          .send({ error: "email is required" });
      }

      if (data.data.email) {
        const existing = await prisma.user.findUnique({
          where: { email: data.data.email },
        });
        if (existing)
          return reply.status(409).send({ error: "Email already in use" });
      }
      if (data.data.phoneNumber) {
        const existing = await prisma.user.findUnique({
          where: { phoneNumber: data.data.phoneNumber },
        });
        if (existing)
          return reply
            .status(409)
            .send({ error: "Phone number already in use" });
      }

      const userId = crypto.randomUUID();
      const hashed = await hashPassword(data.data.password);

      const user = await prisma.user.create({
        data: {
          id: userId,
          name: data.data.name,
          email: data.data.email ?? null,
          phoneNumber: data.data.phoneNumber ?? null,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          createdAt: true,
        },
      });

      await prisma.account.create({
        data: {
          id: crypto.randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: hashed,
        },
      });

      return reply.status(201).send({ user });
    },
  );

  // GET /api/users - paginated list
  app.get(
    "/",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin()
      ],
    },
    async (request, reply) => {
      
      const query = listUsersSchema.safeParse(request.query);
      if (!query.success) {
        return reply.status(400).send({ error: query.error.flatten() });
      }

      const { page, limit, search, banned } = query.data;
      const skip = (page - 1) * limit;

      const where: any = {};
      if (search) {
        where.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phoneNumber: { contains: search } },
        ];
      }
      if (banned !== undefined) {
        where.banned = banned === "true";
      }
      

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            phoneNumberVerified: true,
            emailVerified: true,
            image: true,
            banned: true,
            bannedAt: true,
            bannedReason: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.user.count({ where }),
      ]);


      return reply.send({
        users,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    },
  );

  // GET /api/users/:id - single user detail
  app.get(
    "/:id",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const user = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          phoneNumberVerified: true,
          emailVerified: true,
          image: true,
          banned: true,
          bannedAt: true,
          bannedReason: true,
          createdAt: true,
          updatedAt: true,
          sessions: {
            where: { expiresAt: { gt: new Date() } },
            select: {
              id: true,
              createdAt: true,
              updatedAt: true,
              ipAddress: true,
              userAgent: true,
              expiresAt: true,
            },
            orderBy: { createdAt: "desc" },
          },
        },
      });

      if (!user) {
        return reply.status(404).send({ error: "User not found" });
      }

      return reply.send({
        user: {
          ...user,
        },
      });
    },
  );

  // PUT /api/users/:id - update user fields
  app.put(
    "/:id",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const data = updateUserSchema.safeParse(request.body);
      if (!data.success) {
        return reply.status(400).send({ error: data.error.flatten() });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const user = await prisma.user.update({
        where: { id },
        data: {
          name: data.data.name,
          email: data.data.email,
          phoneNumber: data.data.phoneNumber,
        },
        select: {
          id: true,
          name: true,
          email: true,
          phoneNumber: true,
          updatedAt: true,
        },
      });


      return reply.send({ user });
    },
  );

  // DELETE /api/users/:id - permanently delete a user
  app.delete(
    "/:id",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const actor = (request as any).user;

      if (actor.id === id) {
        return reply
          .status(400)
          .send({ error: "Cannot delete your own account" });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      await prisma.user.delete({ where: { id } });

      return reply.send({ success: true });
    },
  );

  // POST /api/users/:id/ban - ban a user
  app.post(
    "/:id/ban",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = banUserSchema.safeParse(request.body ?? {});
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const actor = (request as any).user;
      if (actor.id === id) {
        return reply.status(400).send({ error: "Cannot ban yourself" });
      }

      await prisma.user.update({
        where: { id },
        data: {
          banned: true,
          bannedAt: new Date(),
          bannedReason: body.data.reason ?? null,
        },
      });

      // Invalidate all active sessions for the banned user
      await prisma.session.deleteMany({ where: { userId: id } });

      return reply.send({ success: true });
    },
  );

  // DELETE /api/users/:id/ban - unban a user
  app.delete(
    "/:id/ban",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      await prisma.user.update({
        where: { id },
        data: { banned: false, bannedAt: null, bannedReason: null },
      });

      return reply.send({ success: true });
    },
  );

  // PATCH /api/users/:id/password - admin force-sets a user's password
  app.patch(
    "/:id/password",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = changePasswordSchema.safeParse(request.body);
      if (!body.success) {
        return reply.status(400).send({ error: body.error.flatten() });
      }

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      const hashed = await hashPassword(body.data.newPassword);

    
      await prisma.$transaction([
            prisma.account.updateMany({
                where: {
                userId: id,
                providerId: "credential",
                },
                data: {
                password: hashed,
                },
            }),
            prisma.session.deleteMany({
                where: {
                userId: id,
                },
            }),
        ]);
      return reply.send({ success: true });
    },
  );

  // DELETE /api/users/:id/sessions/:sessionId - admin revokes one session of any user
  app.delete(
    "/:id/sessions/:sessionId",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id, sessionId } = request.params as {
        id: string;
        sessionId: string;
      };

      const session = await prisma.session.findFirst({
        where: { id: sessionId, userId: id },
      });

      if (!session) {
        return reply.status(404).send({ error: "Session not found" });
      }

      await prisma.session.delete({ where: { id: sessionId } });

      return reply.send({ success: true });
    },
  );

  // DELETE /api/users/:id/sessions - admin revokes ALL sessions of a user
  app.delete(
    "/:id/sessions",
    {
      preHandler: [
        requireAuth,
        authorizeSuperAdmin(),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const existing = await prisma.user.findUnique({ where: { id } });
      if (!existing) {
        return reply.status(404).send({ error: "User not found" });
      }

      await prisma.session.deleteMany({ where: { userId: id } });

      return reply.send({ success: true });
    },
  );
}
