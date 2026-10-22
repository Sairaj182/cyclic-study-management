CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

ALTER TABLE "task"
ADD COLUMN "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM';
