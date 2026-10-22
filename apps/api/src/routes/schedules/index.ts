import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@repo/database";
import { requireAuth } from "../../middleware/auth";

export async function scheduleRoutes(app: FastifyInstance) {
  app.get(
    "/today",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const now = new Date();

      const startOfDay = new Date(now);
      startOfDay.setHours(0, 0, 0, 0);

      const startOfNextDay = new Date(startOfDay);
      startOfNextDay.setDate(
        startOfNextDay.getDate() + 1,
      );

      const schedules = await prisma.schedule.findMany({
        where: {
          scheduleDate: {
            gte: startOfDay,
            lt: startOfNextDay,
          },

          task: {
            userId: user.id,
          },
        },

        orderBy: {
          scheduleDate: "asc",
        },

        include: {
          task: {
            select: {
              id: true,
              taskTitle: true,
              taskDesc: true,
            },
          },
        },
      });

      return reply.send({
        date: startOfDay,
        schedules,
      });
    },
  );

    const listSchedulesSchema = z.object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),

    completed: z
      .enum(["true", "false"])
      .optional(),

    page: z.coerce.number().int().min(1).default(1),

    limit: z.coerce
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50),
  });

  app.get(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const parsed = listSchedulesSchema.safeParse(
        request.query,
      );

      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.flatten(),
        });
      }

      const {
        from,
        to,
        completed,
        page,
        limit,
      } = parsed.data;

      const skip = (page - 1) * limit;

      const where: any = {
        task: {
          userId: user.id,
        },
      };

      if (from || to) {
        where.scheduleDate = {};

        if (from) {
          where.scheduleDate.gte = from;
        }

        if (to) {
          where.scheduleDate.lte = to;
        }
      }

      if (completed === "true") {
        where.completedAt = {
          not: null,
        };
      }

      if (completed === "false") {
        where.completedAt = null;
      }

      const [schedules, total] = await Promise.all([
        prisma.schedule.findMany({
          where,
          skip,
          take: limit,

          orderBy: {
            scheduleDate: "asc",
          },

          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
              },
            },
          },
        }),

        prisma.schedule.count({
          where,
        }),
      ]);

      return reply.send({
        schedules,

        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      });
    },
  );

    app.get(
    "/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const { id } = request.params as {
        id: string;
      };

      const schedule =
        await prisma.schedule.findFirst({
          where: {
            id,

            task: {
              userId: user.id,
            },
          },

          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
              },
            },
          },
        });

      if (!schedule) {
        return reply.status(404).send({
          error: "Schedule not found",
        });
      }

      return reply.send({
        schedule,
      });
    },
  );

    app.patch(
    "/:id/complete",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const { id } = request.params as {
        id: string;
      };

      const schedule =
        await prisma.schedule.findFirst({
          where: {
            id,

            task: {
              userId: user.id,
            },
          },
        });

      if (!schedule) {
        return reply.status(404).send({
          error: "Schedule not found",
        });
      }

      if (schedule.completedAt) {
        return reply.send({
          success: true,
          message: "Schedule already completed",
          schedule,
        });
      }

      const updated =
        await prisma.schedule.update({
          where: {
            id,
          },

          data: {
            completedAt: new Date(),
          },

          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
              },
            },
          },
        });

      return reply.send({
        success: true,
        schedule: updated,
      });
    },
  );

    app.patch(
    "/:id/uncomplete",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const { id } = request.params as {
        id: string;
      };

      const schedule =
        await prisma.schedule.findFirst({
          where: {
            id,

            task: {
              userId: user.id,
            },
          },
        });

      if (!schedule) {
        return reply.status(404).send({
          error: "Schedule not found",
        });
      }

      const updated =
        await prisma.schedule.update({
          where: {
            id,
          },

          data: {
            completedAt: null,
          },

          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
              },
            },
          },
        });

      return reply.send({
        success: true,
        schedule: updated,
      });
    },
  );
}

