-- TCF speaking content audit for Neon PostgreSQL SQL Editor.
-- READ ONLY: every executable statement in this file is a SELECT.
-- Run one labelled query at a time (or select a single section and execute it).
-- Identifiers are quoted to match Prisma's PostgreSQL table/column names.

-- Result 01 — Exact row counts for the requested content tables
SELECT 'Course' AS "tableName", COUNT(*) AS "recordCount" FROM "Course"
UNION ALL SELECT 'CourseModule', COUNT(*) FROM "CourseModule"
UNION ALL SELECT 'Task', COUNT(*) FROM "Task"
UNION ALL SELECT 'Theme', COUNT(*) FROM "Theme"
UNION ALL SELECT 'Topic', COUNT(*) FROM "Topic"
UNION ALL SELECT 'Vocabulary', COUNT(*) FROM "Vocabulary"
UNION ALL SELECT 'GrammarNote', COUNT(*) FROM "GrammarNote"
UNION ALL SELECT 'ExamCriteria', COUNT(*) FROM "ExamCriteria"
UNION ALL SELECT 'Essay', COUNT(*) FROM "Essay"
UNION ALL SELECT 'Media', COUNT(*) FROM "Media"
UNION ALL SELECT 'PracticeSet', COUNT(*) FROM "PracticeSet"
UNION ALL SELECT 'PracticeQuestion', COUNT(*) FROM "PracticeQuestion"
ORDER BY "tableName";

-- Result 02 — Courses and their module/task/content totals
SELECT
  c."id" AS "courseId",
  c."slug" AS "courseSlug",
  c."title" AS "courseTitle",
  c."status"::text AS "courseStatus",
  COUNT(DISTINCT cm."id") AS "moduleCount",
  COUNT(DISTINCT t."id") AS "taskCount",
  COUNT(DISTINCT th."id") AS "themeCount",
  COUNT(DISTINCT tp."id") AS "topicCount",
  COUNT(DISTINCT e."id") AS "essayCount"
FROM "Course" c
LEFT JOIN "CourseModule" cm ON cm."courseId" = c."id"
LEFT JOIN "Task" t ON t."moduleId" = cm."id"
LEFT JOIN "Theme" th ON th."moduleId" = cm."id"
LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
LEFT JOIN "Essay" e ON e."taskId" = t."id"
GROUP BY c."id", c."slug", c."title", c."status"
ORDER BY c."title", c."id";

-- Result 03 — Modules with course, skill, status, and task counts
SELECT
  c."id" AS "courseId",
  c."slug" AS "courseSlug",
  cm."id" AS "moduleId",
  cm."slug" AS "moduleSlug",
  cm."title" AS "moduleTitle",
  cm."skill"::text AS "skill",
  cm."status"::text AS "status",
  COUNT(DISTINCT t."id") AS "taskCount",
  COUNT(DISTINCT th."id") AS "themeCount",
  COUNT(DISTINCT tp."id") AS "topicCount"
FROM "CourseModule" cm
JOIN "Course" c ON c."id" = cm."courseId"
LEFT JOIN "Task" t ON t."moduleId" = cm."id"
LEFT JOIN "Theme" th ON th."moduleId" = cm."id"
LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
GROUP BY c."id", c."slug", cm."id", cm."slug", cm."title", cm."skill", cm."status"
ORDER BY c."title", cm."sortOrder", cm."id";

-- Result 04 — Task counts by type and status
SELECT
  t."type"::text AS "taskType",
  t."status"::text AS "status",
  COUNT(*) AS "taskCount"
FROM "Task" t
GROUP BY t."type", t."status"
ORDER BY t."type"::text, t."status"::text;

-- Result 05 — Task rows and their actual course/module relationships
SELECT
  c."id" AS "courseId",
  c."slug" AS "courseSlug",
  cm."id" AS "moduleId",
  cm."slug" AS "moduleSlug",
  cm."skill"::text AS "moduleSkill",
  t."id" AS "taskId",
  t."type"::text AS "taskType",
  t."format"::text AS "taskFormat",
  t."title" AS "taskTitle",
  t."description" AS "description",
  t."instructions" AS "instructions",
  t."durationMinutes" AS "durationMinutes",
  t."questionCount" AS "questionCount",
  t."introVideoMediaId" AS "introVideoMediaId",
  t."sortOrder" AS "sortOrder",
  t."status"::text AS "status"
FROM "Task" t
JOIN "CourseModule" cm ON cm."id" = t."moduleId"
JOIN "Course" c ON c."id" = cm."courseId"
ORDER BY c."title", cm."sortOrder", t."sortOrder", t."id";

-- Result 06 — Status counts for status-bearing content tables
SELECT 'Course' AS "tableName", "status"::text AS "status", COUNT(*) AS "recordCount"
FROM "Course" GROUP BY "status"
UNION ALL
SELECT 'CourseModule', "status"::text, COUNT(*) FROM "CourseModule" GROUP BY "status"
UNION ALL
SELECT 'Task', "status"::text, COUNT(*) FROM "Task" GROUP BY "status"
UNION ALL
SELECT 'Theme', "status"::text, COUNT(*) FROM "Theme" GROUP BY "status"
UNION ALL
SELECT 'Topic', "status"::text, COUNT(*) FROM "Topic" GROUP BY "status"
UNION ALL
SELECT 'Essay', "status"::text, COUNT(*) FROM "Essay" GROUP BY "status"
UNION ALL
SELECT 'PracticeSet', "status"::text, COUNT(*) FROM "PracticeSet" GROUP BY "status"
ORDER BY "tableName", "status";

-- Result 07 — Published/unpublished counts where publishedAt exists
SELECT
  "tableName",
  "publicationState",
  COUNT(*) AS "recordCount"
FROM (
  SELECT 'Topic' AS "tableName",
         CASE WHEN "publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP' ELSE 'PUBLISHED_TIMESTAMP_SET' END AS "publicationState"
  FROM "Topic"
  UNION ALL
  SELECT 'Essay',
         CASE WHEN "publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP' ELSE 'PUBLISHED_TIMESTAMP_SET' END
  FROM "Essay"
  UNION ALL
  SELECT 'PracticeSet',
         CASE WHEN "publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP' ELSE 'PUBLISHED_TIMESTAMP_SET' END
  FROM "PracticeSet"
) publication_rows
GROUP BY "tableName", "publicationState"
ORDER BY "tableName", "publicationState";

-- Result 08 — Theme-to-topic relationships, task association, and full topic content
SELECT
  c."id" AS "courseId",
  cm."id" AS "moduleId",
  cm."skill"::text AS "moduleSkill",
  th."id" AS "themeId",
  th."slug" AS "themeSlug",
  th."name" AS "themeName",
  th."taskId" AS "themeTaskId",
  th."status"::text AS "themeStatus",
  t."id" AS "associatedTaskId",
  t."type"::text AS "associatedTaskType",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  tp."situation" AS "situation",
  tp."question" AS "question",
  tp."modelAnswer" AS "modelAnswer",
  tp."extraInformation" AS "extraInformation",
  tp."conclusion" AS "conclusion",
  tp."sortOrder" AS "topicSortOrder",
  tp."status"::text AS "topicStatus",
  tp."publishedAt" AS "topicPublishedAt"
FROM "Theme" th
JOIN "CourseModule" cm ON cm."id" = th."moduleId"
JOIN "Course" c ON c."id" = cm."courseId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
ORDER BY c."title", cm."sortOrder", th."sortOrder", tp."sortOrder", tp."id";

-- Result 09 — Task 1 content as stored (no category assumptions)
SELECT
  c."id" AS "courseId",
  cm."id" AS "moduleId",
  t."id" AS "taskId",
  t."type"::text AS "taskType",
  th."id" AS "themeId",
  th."slug" AS "themeSlug",
  th."name" AS "themeName",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  tp."situation" AS "situation",
  tp."question" AS "question",
  tp."modelAnswer" AS "modelAnswer",
  tp."extraInformation" AS "extraInformation",
  tp."conclusion" AS "conclusion",
  tp."sortOrder" AS "sortOrder",
  tp."status"::text AS "status"
FROM "Task" t
JOIN "CourseModule" cm ON cm."id" = t."moduleId"
JOIN "Course" c ON c."id" = cm."courseId"
LEFT JOIN "Theme" th
  ON th."taskId" = t."id"
  OR (th."taskId" IS NULL AND th."moduleId" = t."moduleId")
LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
WHERE t."type" = 'TASK1'
ORDER BY c."title", cm."sortOrder", t."sortOrder", th."sortOrder", tp."sortOrder", tp."id";

-- Result 10 — All Task 2 situations and complete question/learning content
SELECT
  c."id" AS "courseId",
  cm."id" AS "moduleId",
  t."id" AS "taskId",
  t."type"::text AS "taskType",
  th."id" AS "themeId",
  th."slug" AS "themeSlug",
  th."name" AS "themeName",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  tp."situation" AS "situation",
  tp."question" AS "question",
  tp."modelAnswer" AS "modelAnswer",
  tp."extraInformation" AS "extraInformation",
  tp."conclusion" AS "conclusion",
  tp."sortOrder" AS "sortOrder",
  tp."status"::text AS "status",
  tp."publishedAt" AS "publishedAt"
FROM "Task" t
JOIN "CourseModule" cm ON cm."id" = t."moduleId"
JOIN "Course" c ON c."id" = cm."courseId"
LEFT JOIN "Theme" th
  ON th."taskId" = t."id"
  OR (th."taskId" IS NULL AND th."moduleId" = t."moduleId")
LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
WHERE t."type" = 'TASK2'
ORDER BY c."title", cm."sortOrder", t."sortOrder", th."sortOrder", tp."sortOrder", tp."id";

-- Result 11 — Normalized vocabulary for speaking Task 1/2/3 topics
SELECT
  t."type"::text AS "taskType",
  t."id" AS "taskId",
  th."id" AS "themeId",
  th."name" AS "themeName",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  v."id" AS "vocabularyId",
  v."term" AS "term",
  v."meaning" AS "meaning",
  v."example" AS "example",
  v."sortOrder" AS "sortOrder"
FROM "Vocabulary" v
JOIN "Topic" tp ON tp."id" = v."topicId"
JOIN "Theme" th ON th."id" = tp."themeId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
WHERE t."type" IN ('TASK1', 'TASK2', 'TASK3')
   OR (t."id" IS NULL AND cm."skill" = 'SPEAKING')
ORDER BY t."type"::text NULLS LAST, th."sortOrder", tp."sortOrder", v."sortOrder", v."id";

-- Result 12 — Normalized grammar notes for speaking Task 1/2/3 topics
SELECT
  t."type"::text AS "taskType",
  t."id" AS "taskId",
  th."id" AS "themeId",
  th."name" AS "themeName",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  g."id" AS "grammarNoteId",
  g."rule" AS "rule",
  g."explanation" AS "explanation",
  g."example" AS "example",
  g."sortOrder" AS "sortOrder"
FROM "GrammarNote" g
JOIN "Topic" tp ON tp."id" = g."topicId"
JOIN "Theme" th ON th."id" = tp."themeId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
WHERE t."type" IN ('TASK1', 'TASK2', 'TASK3')
   OR (t."id" IS NULL AND cm."skill" = 'SPEAKING')
ORDER BY t."type"::text NULLS LAST, th."sortOrder", tp."sortOrder", g."sortOrder", g."id";

-- Result 13 — Exam criteria for speaking Task 1/2/3 topics
SELECT
  t."type"::text AS "taskType",
  t."id" AS "taskId",
  th."id" AS "themeId",
  th."name" AS "themeName",
  tp."id" AS "topicId",
  tp."slug" AS "topicSlug",
  tp."title" AS "topicTitle",
  ec."id" AS "examCriteriaId",
  ec."lexicalResources" AS "lexicalResources",
  ec."grammar" AS "grammar",
  ec."coherence" AS "coherence",
  ec."taskFulfillment" AS "taskFulfillment",
  ec."relevance" AS "relevance"
FROM "ExamCriteria" ec
JOIN "Topic" tp ON tp."id" = ec."topicId"
JOIN "Theme" th ON th."id" = tp."themeId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
WHERE t."type" IN ('TASK1', 'TASK2', 'TASK3')
   OR (t."id" IS NULL AND cm."skill" = 'SPEAKING')
ORDER BY t."type"::text NULLS LAST, th."sortOrder", tp."sortOrder", tp."id";

-- Result 14 — All Essays with their actual task type and complete legacy content fields
SELECT
  c."id" AS "courseId",
  cm."id" AS "moduleId",
  t."id" AS "taskId",
  t."type"::text AS "taskType",
  e."id" AS "essayId",
  e."slug" AS "essaySlug",
  e."title" AS "essayTitle",
  e."prompt" AS "prompt",
  e."content" AS "content",
  e."summary" AS "summary",
  e."extraInformation" AS "extraInformation",
  e."sortOrder" AS "sortOrder",
  e."status"::text AS "status",
  e."publishedAt" AS "publishedAt"
FROM "Essay" e
LEFT JOIN "Task" t ON t."id" = e."taskId"
LEFT JOIN "CourseModule" cm ON cm."id" = t."moduleId"
LEFT JOIN "Course" c ON c."id" = cm."courseId"
ORDER BY c."title" NULLS LAST, cm."sortOrder" NULLS LAST,
         t."sortOrder" NULLS LAST, e."sortOrder", e."id";

-- Result 15 — Every media record and its Topic/Essay references
SELECT
  m."id" AS "mediaId",
  m."key" AS "key",
  m."type" AS "type",
  m."mimeType" AS "mimeType",
  m."sizeBytes" AS "sizeBytes",
  m."durationSeconds" AS "durationSeconds",
  m."checksum" AS "checksum",
  m."isProtected" AS "isProtected",
  m."topicId" AS "topicId",
  tp."title" AS "topicTitle",
  th."id" AS "themeId",
  t."type"::text AS "topicTaskType",
  m."essayId" AS "essayId",
  e."title" AS "essayTitle",
  et."type"::text AS "essayTaskType",
  m."createdAt" AS "createdAt"
FROM "Media" m
LEFT JOIN "Topic" tp ON tp."id" = m."topicId"
LEFT JOIN "Theme" th ON th."id" = tp."themeId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN "Essay" e ON e."id" = m."essayId"
LEFT JOIN "Task" et ON et."id" = e."taskId"
ORDER BY m."createdAt", m."id";

-- Result 16 — Media attachment/reference integrity candidates
SELECT
  m."id" AS "recordId",
  m."key" AS "mediaKey",
  m."topicId" AS "topicId",
  m."essayId" AS "essayId",
  CASE
    WHEN m."topicId" IS NULL AND m."essayId" IS NULL THEN 'NO_TOPIC_OR_ESSAY_REFERENCE'
    WHEN m."topicId" IS NOT NULL AND m."essayId" IS NOT NULL THEN 'BOTH_TOPIC_AND_ESSAY_REFERENCES'
    ELSE 'HAS_ONE_REFERENCE'
  END AS "finding"
FROM "Media" m
WHERE (m."topicId" IS NULL AND m."essayId" IS NULL)
   OR (m."topicId" IS NOT NULL AND m."essayId" IS NOT NULL)
ORDER BY m."id";

-- Result 17 — ContentAuditLog import history with stored snapshots
SELECT
  cal."id" AS "auditLogId",
  cal."resource" AS "resource",
  cal."resourceId" AS "resourceId",
  cal."action" AS "action",
  cal."actorId" AS "actorId",
  cal."snapshot" AS "snapshot",
  cal."createdAt" AS "createdAt"
FROM "ContentAuditLog" cal
WHERE cal."action" = 'IMPORTED'
   OR cal."action" ILIKE '%IMPORT%'
ORDER BY cal."createdAt", cal."id";

-- Result 18 — Duplicate slug candidates across records (review scope before classifying)
WITH duplicate_groups AS (
  SELECT 'Course' AS "tableName", c."slug" AS "duplicateKey",
         COUNT(*) AS "recordCount",
         ARRAY_AGG(c."id" ORDER BY c."id") AS "recordIds",
         ARRAY_AGG(DISTINCT c."id" ORDER BY c."id") AS "parentIds"
  FROM "Course" c GROUP BY c."slug" HAVING COUNT(*) > 1
  UNION ALL
  SELECT 'CourseModule', cm."slug", COUNT(*),
         ARRAY_AGG(cm."id" ORDER BY cm."id"),
         ARRAY_AGG(DISTINCT cm."courseId" ORDER BY cm."courseId")
  FROM "CourseModule" cm GROUP BY cm."slug" HAVING COUNT(*) > 1
  UNION ALL
  SELECT 'Theme', th."slug", COUNT(*),
         ARRAY_AGG(th."id" ORDER BY th."id"),
         ARRAY_AGG(DISTINCT th."moduleId" ORDER BY th."moduleId")
  FROM "Theme" th GROUP BY th."slug" HAVING COUNT(*) > 1
  UNION ALL
  SELECT 'Topic', tp."slug", COUNT(*),
         ARRAY_AGG(tp."id" ORDER BY tp."id"),
         ARRAY_AGG(DISTINCT tp."themeId" ORDER BY tp."themeId")
  FROM "Topic" tp GROUP BY tp."slug" HAVING COUNT(*) > 1
  UNION ALL
  SELECT 'Essay', e."slug", COUNT(*),
         ARRAY_AGG(e."id" ORDER BY e."id"),
         ARRAY_AGG(DISTINCT e."taskId" ORDER BY e."taskId")
  FROM "Essay" e GROUP BY e."slug" HAVING COUNT(*) > 1
  UNION ALL
  SELECT 'PracticeSet', ps."slug", COUNT(*),
         ARRAY_AGG(ps."id" ORDER BY ps."id"),
         ARRAY_AGG(DISTINCT ps."moduleId" ORDER BY ps."moduleId")
  FROM "PracticeSet" ps GROUP BY ps."slug" HAVING COUNT(*) > 1
)
SELECT "tableName", "duplicateKey", "recordCount", "recordIds", "parentIds"
FROM duplicate_groups
ORDER BY "tableName", "duplicateKey";

-- Result 19 — Duplicate title candidates (review only; no records are merged)
WITH titled_records AS (
  SELECT 'Course' AS "tableName", c."id" AS "recordId", c."title" AS "title",
         c."id" AS "parentId" FROM "Course" c
  UNION ALL
  SELECT 'CourseModule', cm."id", cm."title", cm."courseId" FROM "CourseModule" cm
  UNION ALL
  SELECT 'Task', t."id", t."title", t."moduleId" FROM "Task" t
  UNION ALL
  SELECT 'Theme', th."id", th."name", th."moduleId" FROM "Theme" th
  UNION ALL
  SELECT 'Topic', tp."id", tp."title", tp."themeId" FROM "Topic" tp
  UNION ALL
  SELECT 'Essay', e."id", e."title", e."taskId" FROM "Essay" e
  UNION ALL
  SELECT 'PracticeSet', ps."id", ps."title", ps."moduleId" FROM "PracticeSet" ps
),
duplicate_titles AS (
  SELECT "tableName", "title", COUNT(*) AS "recordCount",
         ARRAY_AGG("recordId" ORDER BY "recordId") AS "recordIds",
         ARRAY_AGG(DISTINCT "parentId" ORDER BY "parentId") AS "parentIds"
  FROM titled_records
  GROUP BY "tableName", "title"
  HAVING COUNT(*) > 1
)
SELECT "tableName", "title", "recordCount", "recordIds", "parentIds"
FROM duplicate_titles
ORDER BY "tableName", "title";

-- Result 20 — Exact duplicate content candidates among Topic and Essay text
WITH text_records AS (
  SELECT 'Topic' AS "tableName", tp."id" AS "recordId", tp."themeId" AS "parentId",
         'situation' AS "fieldName", tp."situation" AS "content"
  FROM "Topic" tp WHERE tp."situation" IS NOT NULL AND tp."situation" <> ''
  UNION ALL
  SELECT 'Topic', tp."id", tp."themeId", 'question', tp."question"
  FROM "Topic" tp WHERE tp."question" IS NOT NULL AND tp."question" <> ''
  UNION ALL
  SELECT 'Topic', tp."id", tp."themeId", 'modelAnswer', tp."modelAnswer"
  FROM "Topic" tp WHERE tp."modelAnswer" IS NOT NULL AND tp."modelAnswer" <> ''
  UNION ALL
  SELECT 'Topic', tp."id", tp."themeId", 'extraInformation', tp."extraInformation"
  FROM "Topic" tp WHERE tp."extraInformation" IS NOT NULL AND tp."extraInformation" <> ''
  UNION ALL
  SELECT 'Essay', e."id", e."taskId", 'prompt', e."prompt"
  FROM "Essay" e WHERE e."prompt" IS NOT NULL AND e."prompt" <> ''
  UNION ALL
  SELECT 'Essay', e."id", e."taskId", 'content', e."content"
  FROM "Essay" e WHERE e."content" IS NOT NULL AND e."content" <> ''
  UNION ALL
  SELECT 'Essay', e."id", e."taskId", 'extraInformation', e."extraInformation"
  FROM "Essay" e WHERE e."extraInformation" IS NOT NULL AND e."extraInformation" <> ''
)
SELECT
  "tableName",
  "fieldName",
  "content",
  COUNT(*) AS "recordCount",
  ARRAY_AGG("recordId" ORDER BY "recordId") AS "recordIds",
  ARRAY_AGG(DISTINCT "parentId" ORDER BY "parentId") AS "parentIds"
FROM text_records
GROUP BY "tableName", "fieldName", "content"
HAVING COUNT(*) > 1
ORDER BY "tableName", "fieldName", "recordCount" DESC;

-- Result 21 — Orphan candidates and logical cross-parent associations
SELECT
  'CourseModule with missing course' AS "checkName",
  cm."id" AS "recordId",
  cm."courseId" AS "relatedId",
  'CourseModule.courseId has no Course row' AS "details"
FROM "CourseModule" cm
LEFT JOIN "Course" c ON c."id" = cm."courseId"
WHERE c."id" IS NULL
UNION ALL
SELECT
  'Task with missing module',
  t."id",
  t."moduleId",
  'Task.moduleId has no CourseModule row'
FROM "Task" t
LEFT JOIN "CourseModule" cm ON cm."id" = t."moduleId"
WHERE cm."id" IS NULL
UNION ALL
SELECT
  'Theme with missing module',
  th."id" AS "recordId",
  th."moduleId" AS "relatedId",
  'Theme.moduleId has no CourseModule row' AS "details"
FROM "Theme" th
LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
WHERE cm."id" IS NULL
UNION ALL
SELECT
  'Topic with missing theme',
  tp."id",
  tp."themeId",
  'Topic.themeId has no Theme row'
FROM "Topic" tp
LEFT JOIN "Theme" th ON th."id" = tp."themeId"
WHERE th."id" IS NULL
UNION ALL
SELECT
  'Vocabulary with missing topic',
  v."id",
  v."topicId",
  'Vocabulary.topicId has no Topic row'
FROM "Vocabulary" v
LEFT JOIN "Topic" tp ON tp."id" = v."topicId"
WHERE tp."id" IS NULL
UNION ALL
SELECT
  'GrammarNote with missing topic',
  g."id",
  g."topicId",
  'GrammarNote.topicId has no Topic row'
FROM "GrammarNote" g
LEFT JOIN "Topic" tp ON tp."id" = g."topicId"
WHERE tp."id" IS NULL
UNION ALL
SELECT
  'ExamCriteria with missing topic',
  ec."id",
  ec."topicId",
  'ExamCriteria.topicId has no Topic row'
FROM "ExamCriteria" ec
LEFT JOIN "Topic" tp ON tp."id" = ec."topicId"
WHERE tp."id" IS NULL
UNION ALL
SELECT
  'Essay with missing task',
  e."id",
  e."taskId",
  'Essay.taskId has no Task row'
FROM "Essay" e
LEFT JOIN "Task" t ON t."id" = e."taskId"
WHERE t."id" IS NULL
UNION ALL
SELECT
  'PracticeSet with missing module',
  ps."id",
  ps."moduleId",
  'PracticeSet.moduleId has no CourseModule row'
FROM "PracticeSet" ps
LEFT JOIN "CourseModule" cm ON cm."id" = ps."moduleId"
WHERE cm."id" IS NULL
UNION ALL
SELECT
  'PracticeSet with missing task',
  ps."id",
  ps."taskId",
  'PracticeSet.taskId is set but has no Task row'
FROM "PracticeSet" ps
LEFT JOIN "Task" t ON t."id" = ps."taskId"
WHERE ps."taskId" IS NOT NULL AND t."id" IS NULL
UNION ALL
SELECT
  'PracticeQuestion with missing PracticeSet',
  pq."id",
  pq."practiceSetId",
  'PracticeQuestion.practiceSetId has no PracticeSet row'
FROM "PracticeQuestion" pq
LEFT JOIN "PracticeSet" ps ON ps."id" = pq."practiceSetId"
WHERE ps."id" IS NULL
UNION ALL
SELECT
  'Media with missing Topic',
  m."id",
  m."topicId",
  'Media.topicId is set but has no Topic row'
FROM "Media" m
LEFT JOIN "Topic" tp ON tp."id" = m."topicId"
WHERE m."topicId" IS NOT NULL AND tp."id" IS NULL
UNION ALL
SELECT
  'Media with missing Essay',
  m."id",
  m."essayId",
  'Media.essayId is set but has no Essay row'
FROM "Media" m
LEFT JOIN "Essay" e ON e."id" = m."essayId"
WHERE m."essayId" IS NOT NULL AND e."id" IS NULL
UNION ALL
SELECT
  'Theme task belongs to another module',
  th."id",
  th."taskId",
  'Theme.taskId exists but Task.moduleId differs from Theme.moduleId'
FROM "Theme" th
JOIN "Task" t ON t."id" = th."taskId"
WHERE t."moduleId" <> th."moduleId"
UNION ALL
SELECT
  'PracticeSet task belongs to another module',
  ps."id",
  ps."taskId",
  'PracticeSet.taskId exists but Task.moduleId differs from PracticeSet.moduleId'
FROM "PracticeSet" ps
JOIN "Task" t ON t."id" = ps."taskId"
WHERE t."moduleId" <> ps."moduleId"
ORDER BY "checkName", "recordId";

-- Result 22 — Media ID references stored on Task/PracticeQuestion without a Media row
SELECT
  'Task.introVideoMediaId' AS "referenceField",
  t."id" AS "recordId",
  t."introVideoMediaId" AS "mediaId"
FROM "Task" t
LEFT JOIN "Media" m ON m."id" = t."introVideoMediaId"
WHERE t."introVideoMediaId" IS NOT NULL AND m."id" IS NULL
UNION ALL
SELECT
  'PracticeQuestion.audioMediaId',
  pq."id",
  pq."audioMediaId"
FROM "PracticeQuestion" pq
LEFT JOIN "Media" m ON m."id" = pq."audioMediaId"
WHERE pq."audioMediaId" IS NOT NULL AND m."id" IS NULL
ORDER BY "referenceField", "recordId";

-- Result 23 — Counts grouped by Theme for speaking Tasks 1/2/3
WITH theme_topic_counts AS (
  SELECT tp."themeId", COUNT(*) AS "topicCount"
  FROM "Topic" tp
  GROUP BY tp."themeId"
),
topic_vocabulary_counts AS (
  SELECT tp."themeId", COUNT(v."id") AS "vocabularyCount"
  FROM "Topic" tp
  LEFT JOIN "Vocabulary" v ON v."topicId" = tp."id"
  GROUP BY tp."themeId"
),
topic_grammar_counts AS (
  SELECT tp."themeId", COUNT(g."id") AS "grammarNoteCount"
  FROM "Topic" tp
  LEFT JOIN "GrammarNote" g ON g."topicId" = tp."id"
  GROUP BY tp."themeId"
),
topic_criteria_counts AS (
  SELECT tp."themeId", COUNT(ec."id") AS "examCriteriaCount"
  FROM "Topic" tp
  LEFT JOIN "ExamCriteria" ec ON ec."topicId" = tp."id"
  GROUP BY tp."themeId"
),
topic_media_counts AS (
  SELECT tp."themeId", COUNT(m."id") AS "mediaCount"
  FROM "Topic" tp
  LEFT JOIN "Media" m ON m."topicId" = tp."id"
  GROUP BY tp."themeId"
)
SELECT
  c."id" AS "courseId",
  c."slug" AS "courseSlug",
  cm."id" AS "moduleId",
  cm."slug" AS "moduleSlug",
  th."id" AS "themeId",
  th."slug" AS "themeSlug",
  th."name" AS "themeName",
  th."taskId" AS "themeTaskId",
  t."type"::text AS "taskType",
  COALESCE(ttc."topicCount", 0) AS "topicCount",
  COALESCE(tvc."vocabularyCount", 0) AS "vocabularyCount",
  COALESCE(tgc."grammarNoteCount", 0) AS "grammarNoteCount",
  COALESCE(tcc."examCriteriaCount", 0) AS "examCriteriaCount",
  COALESCE(tmc."mediaCount", 0) AS "mediaCount"
FROM "Theme" th
JOIN "CourseModule" cm ON cm."id" = th."moduleId"
JOIN "Course" c ON c."id" = cm."courseId"
LEFT JOIN "Task" t ON t."id" = th."taskId"
LEFT JOIN theme_topic_counts ttc ON ttc."themeId" = th."id"
LEFT JOIN topic_vocabulary_counts tvc ON tvc."themeId" = th."id"
LEFT JOIN topic_grammar_counts tgc ON tgc."themeId" = th."id"
LEFT JOIN topic_criteria_counts tcc ON tcc."themeId" = th."id"
LEFT JOIN topic_media_counts tmc ON tmc."themeId" = th."id"
WHERE t."type" IN ('TASK1', 'TASK2', 'TASK3')
   OR (t."id" IS NULL AND cm."skill" = 'SPEAKING')
ORDER BY c."title", cm."sortOrder", th."sortOrder", th."id";
