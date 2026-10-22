import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@repo/database";
import { requireAuth } from "../../middleware/auth";
import { DEFAULT_REVISION_INTERVALS } from "../../services/revision.service";

const createStudyLogSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  loggedAt: z.coerce.date().optional(),
});

export async function studyLogRoutes(app: FastifyInstance) {
  app.post("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const parsed = createStudyLogSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { title, description, priority } = parsed.data;
    const loggedAt = parsed.data.loggedAt ?? new Date();
    if (loggedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return reply.status(400).send({ error: "Study logs cannot be dated in the future" });
    }
    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          userId: user.id,
          taskTitle: title,
          taskDesc: description,
          priority,
        },
      });

      const schedules: {
        taskId: string;
        scheduleDate: Date;
        completedAt?: Date;
      }[] = [];
      let currentDate = new Date(loggedAt);
      for (const interval of DEFAULT_REVISION_INTERVALS.slice(1)) {
        const scheduleDate = new Date(currentDate);
        scheduleDate.setDate(scheduleDate.getDate() + interval);
        schedules.push({
          taskId: task.id,
          scheduleDate,
        });
        currentDate = scheduleDate;
      }
      await tx.schedule.createMany({ data: schedules });

      const studyLog = await tx.studyLog.create({
        data: {
          userId: user.id,
          taskId: task.id,
          title,
          description,
          priority,
          loggedAt,
        },
      });
      return { task, studyLog };
    });

    return reply.status(201).send(result);
  });

  app.put("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const parsed = createStudyLogSchema.partial().safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });
    const { id } = request.params as { id: string };
    const existing = await prisma.studyLog.findFirst({ where: { id, userId: user.id } });
    if (!existing) return reply.status(404).send({ error: "Study log not found" });
    if (parsed.data.loggedAt && parsed.data.loggedAt.getTime() > Date.now() + 24 * 60 * 60 * 1000) {
      return reply.status(400).send({ error: "Study logs cannot be dated in the future" });
    }
    const updated = await prisma.$transaction(async (tx) => {
      const log = await tx.studyLog.update({
        where: { id },
        data: {
          ...(parsed.data.title !== undefined && { title: parsed.data.title }),
          ...(parsed.data.description !== undefined && { description: parsed.data.description }),
          ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
          ...(parsed.data.loggedAt !== undefined && { loggedAt: parsed.data.loggedAt }),
        },
      });
      if (existing.taskId) {
        await tx.task.update({
          where: { id: existing.taskId },
          data: {
            ...(parsed.data.title !== undefined && { taskTitle: parsed.data.title }),
            ...(parsed.data.description !== undefined && { taskDesc: parsed.data.description }),
            ...(parsed.data.priority !== undefined && { priority: parsed.data.priority }),
          },
        });
      }
      return log;
    });
    return reply.send({ studyLog: updated });
  });

  app.delete("/:id", { preHandler: [requireAuth] }, async (request, reply) => {
    const user = (request as any).user;
    const { id } = request.params as { id: string };
    const existing = await prisma.studyLog.findFirst({ where: { id, userId: user.id } });
    if (!existing) return reply.status(404).send({ error: "Study log not found" });
    await prisma.$transaction(async (tx) => {
      await tx.studyLog.delete({ where: { id } });
      if (existing.taskId) await tx.task.delete({ where: { id: existing.taskId } });
    });
    return reply.send({ success: true });
  });
}
