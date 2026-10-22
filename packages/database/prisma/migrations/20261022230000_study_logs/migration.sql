CREATE TABLE "study_log" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "taskId" TEXT,
    "title" VARCHAR(100) NOT NULL,
    "description" VARCHAR(500),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "loggedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "study_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "study_log_userId_loggedAt_idx" ON "study_log"("userId", "loggedAt");
CREATE INDEX "study_log_taskId_idx" ON "study_log"("taskId");
ALTER TABLE "study_log" ADD CONSTRAINT "study_log_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "study_log" ADD CONSTRAINT "study_log_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
