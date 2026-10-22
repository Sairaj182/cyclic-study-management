UPDATE "schedule" AS schedule
SET
    "completedAt" = study_log."loggedAt",
    "updatedAt" = CURRENT_TIMESTAMP
FROM "study_log" AS study_log
WHERE study_log."taskId" = schedule."taskId"
  AND schedule."completedAt" IS NULL
  AND schedule."scheduleDate" >= date_trunc('day', study_log."loggedAt")
  AND schedule."scheduleDate" < date_trunc('day', study_log."loggedAt") + INTERVAL '1 day';
