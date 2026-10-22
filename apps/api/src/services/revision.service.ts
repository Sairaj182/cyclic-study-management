import { prisma } from "@repo/database";

export const DEFAULT_REVISION_INTERVALS = [0, 1, 3, 7, 14, 30];

export async function generateSchedules(
  taskId: string,
  startDate: Date = new Date(),
) {
  const schedules = [];

  let currentDate = new Date(startDate);

  for (const interval of DEFAULT_REVISION_INTERVALS) {
    currentDate = new Date(currentDate);
    currentDate.setDate(currentDate.getDate() + interval);

    schedules.push({
      taskId,
      scheduleDate: currentDate,
    });
  }

  return prisma.schedule.createMany({
    data: schedules,
  });
}