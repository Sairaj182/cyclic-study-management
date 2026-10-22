import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "@repo/database";
import { requireAuth } from "../../middleware/auth";

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
});

export async function calendarRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireAuth] }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const user = (request as any).user;
    const start = new Date(`${parsed.data.date}T00:00:00.000Z`);
    if (Number.isNaN(start.getTime())) {
      return reply.status(400).send({ error: "Invalid calendar date" });
    }
    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    const [studyLogs, scheduled] = await Promise.all([
      prisma.studyLog.findMany({
        where: { userId: user.id, loggedAt: { gte: start, lt: end } },
        orderBy: { loggedAt: "asc" },
      }),
      prisma.schedule.findMany({
        where: {
          scheduleDate: { gte: start, lt: end },
          task: {
            userId: user.id,
            NOT: { studyLogs: { some: { loggedAt: { gte: start, lt: end } } } },
          },
        },
        orderBy: [{ scheduleDate: "asc" }, { id: "asc" }],
        include: {
          task: {
            select: { id: true, taskTitle: true, taskDesc: true, priority: true },
          },
        },
      }),
    ]);

    const uniqueScheduled = scheduled.filter((schedule, index, all) => {
      const key = `${schedule.taskId}:${schedule.scheduleDate.toISOString().slice(0, 10)}`;
      return index === all.findIndex((candidate) => `${candidate.taskId}:${candidate.scheduleDate.toISOString().slice(0, 10)}` === key);
    });
    const isPast = end <= new Date();

    return reply.send({
      date: parsed.data.date,
      studyLogs,
      scheduled: uniqueScheduled,
      completedRevisions: uniqueScheduled.filter((schedule) => schedule.completedAt),
      missedRevisions: isPast ? uniqueScheduled.filter((schedule) => !schedule.completedAt) : [],
      upcomingRevisions: isPast ? [] : uniqueScheduled.filter((schedule) => !schedule.completedAt),
    });
  });
}
