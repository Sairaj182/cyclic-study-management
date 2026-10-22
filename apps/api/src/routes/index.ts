import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health";
import { taskRoutes } from "./tasks";
import { scheduleRoutes } from "./schedules";
import { authRoutes } from "./auth";
import { usersRoutes } from "./users";
import { studyLogRoutes } from "./study-logs";
import { calendarRoutes } from "./calendar";


export function registerRoutes(app: FastifyInstance) {
  app.register(healthRoutes, { prefix: "/api" });
  app.register(taskRoutes, {prefix: "/api/tasks"});
  app.register(scheduleRoutes, {prefix: "/api/schedules"});
  app.register(authRoutes, { prefix: "/api/auth" });
  app.register(usersRoutes, { prefix: "/api/users" });
  app.register(studyLogRoutes, { prefix: "/api/study-logs" });
  app.register(calendarRoutes, { prefix: "/api/calendar" });

}
