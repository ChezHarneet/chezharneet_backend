-- Add explicit exam skills and task formats while preserving existing speaking content.
CREATE TYPE "CourseSkill" AS ENUM ('SPEAKING', 'LISTENING', 'WRITING', 'READING');
CREATE TYPE "TaskFormat" AS ENUM (
  'SPEAKING_INTERVIEW',
  'SPEAKING_INTERACTION',
  'SPEAKING_VIEWPOINT',
  'LISTENING_MESSAGES',
  'LISTENING_CONVERSATIONS',
  'LISTENING_INTERVIEWS',
  'WRITING_MESSAGE',
  'WRITING_ARTICLE',
  'WRITING_OPINION',
  'READING_TEXTS',
  'READING_DOCUMENTS',
  'READING_OPINIONS'
);
CREATE TYPE "PracticeMode" AS ENUM ('PRACTICE', 'SIMULATION', 'RECENT_SUBJECT');

ALTER TABLE "CourseModule"
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "examLabel" TEXT,
  ADD COLUMN "questionCount" INTEGER,
  ADD COLUMN "skill" "CourseSkill";

UPDATE "CourseModule" SET "skill" = 'SPEAKING' WHERE "skill" IS NULL;
ALTER TABLE "CourseModule" ALTER COLUMN "skill" SET NOT NULL;

ALTER TABLE "Task"
  ADD COLUMN "durationMinutes" INTEGER,
  ADD COLUMN "format" "TaskFormat",
  ADD COLUMN "instructions" TEXT,
  ADD COLUMN "questionCount" INTEGER;

UPDATE "Task"
SET "format" = CASE "type"
  WHEN 'TASK1' THEN 'SPEAKING_INTERVIEW'::"TaskFormat"
  WHEN 'TASK2' THEN 'SPEAKING_INTERACTION'::"TaskFormat"
  WHEN 'TASK3' THEN 'SPEAKING_VIEWPOINT'::"TaskFormat"
END
WHERE "format" IS NULL;
ALTER TABLE "Task" ALTER COLUMN "format" SET NOT NULL;

CREATE TABLE "PracticeSet" (
  "id" TEXT NOT NULL,
  "moduleId" TEXT NOT NULL,
  "taskId" TEXT,
  "slug" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "mode" "PracticeMode" NOT NULL DEFAULT 'PRACTICE',
  "durationMinutes" INTEGER,
  "questionCount" INTEGER,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "publishedAt" TIMESTAMP(3),
  CONSTRAINT "PracticeSet_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PracticeQuestion" (
  "id" TEXT NOT NULL,
  "practiceSetId" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "options" JSONB,
  "answer" TEXT,
  "explanation" TEXT,
  "audioMediaId" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "PracticeQuestion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseModule_courseId_skill_key" ON "CourseModule"("courseId", "skill");
CREATE UNIQUE INDEX "PracticeSet_moduleId_slug_key" ON "PracticeSet"("moduleId", "slug");
CREATE INDEX "PracticeSet_taskId_sortOrder_idx" ON "PracticeSet"("taskId", "sortOrder");
CREATE INDEX "PracticeSet_status_publishedAt_idx" ON "PracticeSet"("status", "publishedAt");
CREATE INDEX "PracticeQuestion_practiceSetId_sortOrder_idx" ON "PracticeQuestion"("practiceSetId", "sortOrder");

ALTER TABLE "PracticeSet" ADD CONSTRAINT "PracticeSet_moduleId_fkey"
  FOREIGN KEY ("moduleId") REFERENCES "CourseModule"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeSet" ADD CONSTRAINT "PracticeSet_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PracticeQuestion" ADD CONSTRAINT "PracticeQuestion_practiceSetId_fkey"
  FOREIGN KEY ("practiceSetId") REFERENCES "PracticeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
