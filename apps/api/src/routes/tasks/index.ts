import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@repo/database";
import { requireAuth } from "../../middleware/auth";
import {
  DEFAULT_REVISION_INTERVALS,
} from "../../services/revision.service";

const createTaskSchema = z.object({
  taskTitle: z
    .string()
    .trim()
    .min(1, "Task title is required")
    .max(100),

  taskDesc: z
    .string()
    .trim()
    .max(500)
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
});

const updateTaskSchema = z.object({
  taskTitle: z
    .string()
    .trim()
    .min(1)
    .max(100)
    .optional(),

  taskDesc: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).optional(),
});

const listTasksSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),

  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20),

  search: z.string().trim().optional(),
});

export async function taskRoutes(app: FastifyInstance) {
  app.post(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const parsed = createTaskSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.flatten(),
        });
      }

      const { taskTitle, taskDesc } = parsed.data;

      const task = await prisma.$transaction(async (tx) => {
        const task = await tx.task.create({
          data: {
            userId: user.id,
            taskTitle,
            taskDesc,
            priority: parsed.data.priority,
          },
        });

        const schedules = [];

        let currentDate = new Date();

        for (const interval of DEFAULT_REVISION_INTERVALS) {
          const scheduleDate = new Date(currentDate);

          scheduleDate.setDate(
            scheduleDate.getDate() + interval,
          );

          schedules.push({
            taskId: task.id,
            scheduleDate,
          });

          currentDate = scheduleDate;
        }

        await tx.schedule.createMany({
          data: schedules,
        });

        return task;
      });

      return reply.status(201).send({
        task,
      });
    },
  );

    app.get(
    "/",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const parsed = listTasksSchema.safeParse(request.query);

      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.flatten(),
        });
      }

      const {
        page,
        limit,
        search,
      } = parsed.data;

      const skip = (page - 1) * limit;

      const where: any = {
        userId: user.id,
      };

      if (search) {
        where.OR = [
          {
            taskTitle: {
              contains: search,
              mode: "insensitive",
            },
          },
          {
            taskDesc: {
              contains: search,
              mode: "insensitive",
            },
          },
        ];
      }

      const [tasks, total] = await Promise.all([
        prisma.task.findMany({
          where,
          skip,
          take: limit,

          orderBy: {
            createdAt: "desc",
          },

          include: {
            schedules: {
              orderBy: {
                scheduleDate: "asc",
              },
            },
          },
        }),

        prisma.task.count({
          where,
        }),
      ]);

      return reply.send({
        tasks,

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
    "/dashboard",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = (request as any).user;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startOfNextDay = new Date(startOfDay);
      startOfNextDay.setDate(startOfNextDay.getDate() + 1);

      const [recentTasks, today, history] = await Promise.all([
        prisma.task.findMany({
          where: {
            userId: user.id,
            schedules: {
              some: { completedAt: null, scheduleDate: { gte: startOfDay } },
            },
          },
          orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
          take: 10,
          include: {
            schedules: {
              where: { completedAt: null, scheduleDate: { gte: startOfDay } },
              orderBy: { scheduleDate: "asc" },
              take: 1,
              select: { id: true, scheduleDate: true },
            },
          },
        }),
        prisma.schedule.findMany({
          where: {
            scheduleDate: { gte: startOfDay, lt: startOfNextDay },
            task: {
              userId: user.id,
              NOT: { studyLogs: { some: { loggedAt: { gte: startOfDay, lt: startOfNextDay } } } },
            },
          },
          orderBy: [{ completedAt: "asc" }, { scheduleDate: "asc" }],
          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
                priority: true,
              },
            },
          },
        }),
        prisma.schedule.findMany({
          where: {
            completedAt: { not: null },
            task: { userId: user.id },
          },
          orderBy: { completedAt: "desc" },
          take: 20,
          include: {
            task: {
              select: {
                id: true,
                taskTitle: true,
                taskDesc: true,
                priority: true,
              },
            },
          },
        }),
      ]);

      const uniqueToday = today.filter((schedule, index, all) => {
        const key = `${schedule.taskId}:${schedule.scheduleDate.toISOString().slice(0, 10)}`;
        return index === all.findIndex((candidate) => `${candidate.taskId}:${candidate.scheduleDate.toISOString().slice(0, 10)}` === key);
      });

      return reply.send({ recentTasks, today: uniqueToday, history, date: startOfDay });
    },
  );

  app.get(
    "/history",
    { preHandler: [requireAuth] },
    async (request, reply) => {
      const user = (request as any).user;
      const parsed = z.object({
        search: z.string().trim().max(100).optional(),
        status: z.enum(["all", "completed", "missed"]).default("all"),
      }).safeParse(request.query);
      if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

      const where: any = { task: { userId: user.id } };
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      where.scheduleDate = { lt: todayStart };
      if (parsed.data.search) {
        where.task = {
          userId: user.id,
          OR: [
            { taskTitle: { contains: parsed.data.search, mode: "insensitive" } },
            { taskDesc: { contains: parsed.data.search, mode: "insensitive" } },
          ],
        };
      }
      if (parsed.data.status === "completed") where.completedAt = { not: null };
      if (parsed.data.status === "missed") {
        where.completedAt = null;
        where.scheduleDate = { lt: new Date() };
      }

      const schedules = await prisma.schedule.findMany({
        where,
        orderBy: { scheduleDate: "desc" },
        take: 100,
        include: {
          task: { select: { id: true, taskTitle: true, taskDesc: true, priority: true } },
        },
      });
      const uniqueSchedules = schedules.filter((schedule, index, all) => {
        const key = `${schedule.taskId}:${schedule.scheduleDate.toISOString().slice(0, 10)}`;
        return index === all.findIndex((candidate) => `${candidate.taskId}:${candidate.scheduleDate.toISOString().slice(0, 10)}` === key);
      });
      return reply.send({ schedules: uniqueSchedules });
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

      const task = await prisma.task.findFirst({
        where: {
          id,
          userId: user.id,
        },

        include: {
          schedules: {
            orderBy: {
              scheduleDate: "asc",
            },
          },
        },
      });

      if (!task) {
        return reply.status(404).send({
          error: "Task not found",
        });
      }

      return reply.send({
        task,
      });
    },
  );

    app.put(
    "/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const { id } = request.params as {
        id: string;
      };

      const parsed = updateTaskSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.flatten(),
        });
      }

      const existingTask = await prisma.task.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!existingTask) {
        return reply.status(404).send({
          error: "Task not found",
        });
      }

      const task = await prisma.task.update({
        where: {
          id,
        },

        data: {
          ...(parsed.data.taskTitle !== undefined && {
            taskTitle: parsed.data.taskTitle,
          }),

          ...(parsed.data.taskDesc !== undefined && {
            taskDesc: parsed.data.taskDesc,
          }),
          ...(parsed.data.priority !== undefined && {
            priority: parsed.data.priority,
          }),
        },
      });
      await prisma.studyLog.updateMany({
        where: { taskId: id, userId: user.id },
        data: {
          ...(parsed.data.taskTitle !== undefined && { title: parsed.data.taskTitle }),
          ...(parsed.data.taskDesc !== undefined && { description: parsed.data.taskDesc }),
          ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
        },
      });

      return reply.send({
        task,
      });
    },
  );

    app.delete(
    "/:id",
    {
      preHandler: [requireAuth],
    },
    async (request, reply) => {
      const user = (request as any).user;

      const { id } = request.params as {
        id: string;
      };

      const task = await prisma.task.findFirst({
        where: {
          id,
          userId: user.id,
        },
      });

      if (!task) {
        return reply.status(404).send({
          error: "Task not found",
        });
      }

      await prisma.$transaction([
        prisma.studyLog.deleteMany({ where: { taskId: id, userId: user.id } }),
        prisma.task.delete({ where: { id } }),
      ]);

      return reply.send({
        success: true,
      });
    },
  );
}