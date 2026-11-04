-- Consolidated, read-only speaking-content audit for Neon PostgreSQL.
-- Execute this single SELECT and export its one result set as CSV.
-- Full text fields are included in JSONB without SQL-side truncation.

WITH
table_counts AS (
  SELECT 'Course'::text AS table_name, COUNT(*)::bigint AS record_count FROM "Course"
  UNION ALL SELECT 'CourseModule', COUNT(*)::bigint FROM "CourseModule"
  UNION ALL SELECT 'Task', COUNT(*)::bigint FROM "Task"
  UNION ALL SELECT 'Theme', COUNT(*)::bigint FROM "Theme"
  UNION ALL SELECT 'Topic', COUNT(*)::bigint FROM "Topic"
  UNION ALL SELECT 'Vocabulary', COUNT(*)::bigint FROM "Vocabulary"
  UNION ALL SELECT 'GrammarNote', COUNT(*)::bigint FROM "GrammarNote"
  UNION ALL SELECT 'ExamCriteria', COUNT(*)::bigint FROM "ExamCriteria"
  UNION ALL SELECT 'Essay', COUNT(*)::bigint FROM "Essay"
  UNION ALL SELECT 'Media', COUNT(*)::bigint FROM "Media"
  UNION ALL SELECT 'PracticeSet', COUNT(*)::bigint FROM "PracticeSet"
  UNION ALL SELECT 'PracticeQuestion', COUNT(*)::bigint FROM "PracticeQuestion"
),
grouping_rows AS (
  SELECT
    'course_summary'::text AS section,
    c."id"::text AS record_id,
    jsonb_build_object(
      'courseId', c."id",
      'courseSlug', c."slug",
      'courseTitle', c."title",
      'status', c."status"::text,
      'moduleCount', (SELECT COUNT(*) FROM "CourseModule" cm WHERE cm."courseId" = c."id"),
      'taskCount', (
        SELECT COUNT(*) FROM "Task" t
        JOIN "CourseModule" cm ON cm."id" = t."moduleId"
        WHERE cm."courseId" = c."id"
      ),
      'themeCount', (
        SELECT COUNT(*) FROM "Theme" th
        JOIN "CourseModule" cm ON cm."id" = th."moduleId"
        WHERE cm."courseId" = c."id"
      ),
      'topicCount', (
        SELECT COUNT(*) FROM "Topic" tp
        JOIN "Theme" th ON th."id" = tp."themeId"
        JOIN "CourseModule" cm ON cm."id" = th."moduleId"
        WHERE cm."courseId" = c."id"
      ),
      'essayCount', (
        SELECT COUNT(*) FROM "Essay" e
        JOIN "Task" t ON t."id" = e."taskId"
        JOIN "CourseModule" cm ON cm."id" = t."moduleId"
        WHERE cm."courseId" = c."id"
      )
    ) AS data
  FROM "Course" c

  UNION ALL
  SELECT
    'module_summary',
    cm."id",
    jsonb_build_object(
      'courseId', cm."courseId",
      'moduleId', cm."id",
      'moduleSlug', cm."slug",
      'moduleTitle', cm."title",
      'skill', cm."skill"::text,
      'status', cm."status"::text,
      'taskCount', (SELECT COUNT(*) FROM "Task" t WHERE t."moduleId" = cm."id"),
      'themeCount', (SELECT COUNT(*) FROM "Theme" th WHERE th."moduleId" = cm."id"),
      'topicCount', (
        SELECT COUNT(*) FROM "Topic" tp
        JOIN "Theme" th ON th."id" = tp."themeId"
        WHERE th."moduleId" = cm."id"
      )
    )
  FROM "CourseModule" cm

  UNION ALL
  SELECT
    'task_type_status_count',
    t."type"::text || ':' || t."status"::text,
    jsonb_build_object(
      'taskType', t."type"::text,
      'status', t."status"::text,
      'recordCount', COUNT(*)
    )
  FROM "Task" t
  GROUP BY t."type", t."status"

  UNION ALL
  SELECT
    'content_status_count',
    s.table_name || ':' || s.status,
    jsonb_build_object(
      'tableName', s.table_name, 
      'status', s.status,
      'recordCount', s.record_count
    )
  FROM (
    SELECT 'Course'::text AS table_name, c."status"::text AS status, COUNT(*) AS record_count
    FROM "Course" c GROUP BY c."status"
    UNION ALL
    SELECT 'CourseModule', cm."status"::text, COUNT(*) FROM "CourseModule" cm GROUP BY cm."status"
    UNION ALL
    SELECT 'Task', t."status"::text, COUNT(*) FROM "Task" t GROUP BY t."status"
    UNION ALL
    SELECT 'Theme', th."status"::text, COUNT(*) FROM "Theme" th GROUP BY th."status"
    UNION ALL
    SELECT 'Topic', tp."status"::text, COUNT(*) FROM "Topic" tp GROUP BY tp."status"
    UNION ALL
    SELECT 'Essay', e."status"::text, COUNT(*) FROM "Essay" e GROUP BY e."status"
    UNION ALL
    SELECT 'PracticeSet', ps."status"::text, COUNT(*) FROM "PracticeSet" ps GROUP BY ps."status"
  ) s

  UNION ALL
  SELECT
    'publication_status_count',
    p.table_name || ':' || p.publication_state,
    jsonb_build_object(
      'tableName', p.table_name,
      'publicationState', p.publication_state,
      'recordCount', p.record_count
    )
  FROM (
    SELECT 'Topic'::text AS table_name,
           CASE WHEN tp."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                ELSE 'PUBLISHED_TIMESTAMP_SET' END AS publication_state,
           COUNT(*) AS record_count
    FROM "Topic" tp
    GROUP BY CASE WHEN tp."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                  ELSE 'PUBLISHED_TIMESTAMP_SET' END
    UNION ALL
    SELECT 'Essay',
           CASE WHEN e."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                ELSE 'PUBLISHED_TIMESTAMP_SET' END,
           COUNT(*)
    FROM "Essay" e
    GROUP BY CASE WHEN e."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                  ELSE 'PUBLISHED_TIMESTAMP_SET' END
    UNION ALL
    SELECT 'PracticeSet',
           CASE WHEN ps."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                ELSE 'PUBLISHED_TIMESTAMP_SET' END,
           COUNT(*)
    FROM "PracticeSet" ps
    GROUP BY CASE WHEN ps."publishedAt" IS NULL THEN 'UNPUBLISHED_OR_NO_TIMESTAMP'
                  ELSE 'PUBLISHED_TIMESTAMP_SET' END
  ) p

  UNION ALL
  SELECT
    'theme_summary',
    th."id",
    jsonb_build_object(
      'themeId', th."id",
      'themeSlug', th."slug",
      'themeName', th."name",
      'moduleId', th."moduleId",
      'taskId', th."taskId",
      'taskType', t."type"::text,
      'topicCount', (SELECT COUNT(*) FROM "Topic" tp WHERE tp."themeId" = th."id"),
      'vocabularyCount', (
        SELECT COUNT(*) FROM "Vocabulary" v
        JOIN "Topic" tp ON tp."id" = v."topicId"
        WHERE tp."themeId" = th."id"
      ),
      'grammarNoteCount', (
        SELECT COUNT(*) FROM "GrammarNote" g
        JOIN "Topic" tp ON tp."id" = g."topicId"
        WHERE tp."themeId" = th."id"
      ),
      'examCriteriaCount', (
        SELECT COUNT(*) FROM "ExamCriteria" ec
        JOIN "Topic" tp ON tp."id" = ec."topicId"
        WHERE tp."themeId" = th."id"
      ),
      'mediaCount', (
        SELECT COUNT(*) FROM "Media" m
        JOIN "Topic" tp ON tp."id" = m."topicId"
        WHERE tp."themeId" = th."id"
      )
    )
  FROM "Theme" th
  LEFT JOIN "Task" t ON t."id" = th."taskId"
),
speaking_topic_context AS (
  SELECT
    c."id" AS course_id,
    c."slug" AS course_slug,
    cm."id" AS module_id,
    cm."slug" AS module_slug,
    cm."skill"::text AS module_skill,
    t."id" AS task_id,
    t."type"::text AS task_type,
    th."id" AS theme_id,
    th."slug" AS theme_slug,
    th."name" AS theme_name,
    th."taskId" AS theme_task_id,
    tp."id" AS topic_id,
    tp."slug" AS topic_slug,
    tp."title" AS topic_title
  FROM "Topic" tp
  JOIN "Theme" th ON th."id" = tp."themeId"
  JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  JOIN "Course" c ON c."id" = cm."courseId"
  LEFT JOIN "Task" t ON t."id" = th."taskId"
  WHERE cm."skill" = 'SPEAKING'
     OR t."type" IN ('TASK1', 'TASK2', 'TASK3')
),
task_rows AS (
  SELECT
    t."id" AS record_id,
    jsonb_build_object(
      'courseId', c."id",
      'courseSlug', c."slug",
      'courseTitle', c."title",
      'courseStatus', c."status"::text,
      'moduleId', cm."id",
      'moduleSlug', cm."slug",
      'moduleTitle', cm."title",
      'moduleSkill', cm."skill"::text,
      'moduleStatus', cm."status"::text,
      'taskId', t."id",
      'taskType', t."type"::text,
      'taskFormat', t."format"::text,
      'taskTitle', t."title",
      'description', t."description",
      'instructions', t."instructions",
      'durationMinutes', t."durationMinutes",
      'questionCount', t."questionCount",
      'introVideoMediaId', t."introVideoMediaId",
      'sortOrder', t."sortOrder",
      'status', t."status"::text,
      'themeCount', (
        SELECT COUNT(*) FROM "Theme" th
        WHERE th."taskId" = t."id"
      ),
      'essayCount', (SELECT COUNT(*) FROM "Essay" e WHERE e."taskId" = t."id")
    ) AS data
  FROM "Task" t
  JOIN "CourseModule" cm ON cm."id" = t."moduleId"
  JOIN "Course" c ON c."id" = cm."courseId"
  WHERE t."type" IN ('TASK1', 'TASK2', 'TASK3')
     OR cm."skill" = 'SPEAKING'
),
theme_topic_rows AS (
  SELECT
    th."id" AS record_id,
    jsonb_build_object(
      'courseId', c."id",
      'courseSlug', c."slug",
      'moduleId', cm."id",
      'moduleSlug', cm."slug",
      'moduleSkill', cm."skill"::text,
      'themeId', th."id",
      'themeSlug', th."slug",
      'themeName', th."name",
      'themeDescription', th."description",
      'themeSortOrder', th."sortOrder",
      'themeStatus', th."status"::text,
      'themeTaskId', th."taskId",
      'associatedTaskType', t."type"::text,
      'topics', COALESCE(
        jsonb_agg(
          jsonb_build_object(
            'topicId', tp."id",
            'slug', tp."slug",
            'title', tp."title",
            'situation', tp."situation",
            'question', tp."question",
            'modelAnswer', tp."modelAnswer",
            'extraInformation', tp."extraInformation",
            'conclusion', tp."conclusion",
            'sortOrder', tp."sortOrder",
            'status', tp."status"::text,
            'publishedAt', tp."publishedAt"
          ) ORDER BY tp."sortOrder", tp."id"
        ) FILTER (WHERE tp."id" IS NOT NULL),
        '[]'::jsonb
      )
    ) AS data
  FROM "Theme" th
  JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  JOIN "Course" c ON c."id" = cm."courseId"
  LEFT JOIN "Task" t ON t."id" = th."taskId"
  LEFT JOIN "Topic" tp ON tp."themeId" = th."id"
  WHERE cm."skill" = 'SPEAKING'
     OR t."type" IN ('TASK1', 'TASK2', 'TASK3')
  GROUP BY c."id", c."slug", cm."id", cm."slug", cm."skill",
           th."id", th."slug", th."name", th."description",
           th."sortOrder", th."status", th."taskId", t."type"
),
duplicate_slug_candidates AS (
  SELECT
    d.table_name,
    d.duplicate_key,
    COUNT(*) AS record_count,
    jsonb_agg(
      jsonb_build_object('recordId', d.record_id, 'parentId', d.parent_id, 'title', d.title)
      ORDER BY d.record_id
    ) AS records
  FROM (
    SELECT 'Course'::text AS table_name, c."slug"::text AS duplicate_key,
           c."id"::text AS record_id, NULL::text AS parent_id, c."title" AS title
    FROM "Course" c
    UNION ALL
    SELECT 'CourseModule', cm."slug", cm."id", cm."courseId", cm."title"
    FROM "CourseModule" cm
    UNION ALL
    SELECT 'Theme', th."slug", th."id", th."moduleId", th."name"
    FROM "Theme" th
    UNION ALL
    SELECT 'Topic', tp."slug", tp."id", tp."themeId", tp."title"
    FROM "Topic" tp
    UNION ALL
    SELECT 'Essay', e."slug", e."id", e."taskId", e."title"
    FROM "Essay" e
    UNION ALL
    SELECT 'PracticeSet', ps."slug", ps."id", ps."moduleId", ps."title"
    FROM "PracticeSet" ps
  ) d
  GROUP BY d.table_name, d.duplicate_key
  HAVING COUNT(*) > 1
),
duplicate_title_candidates AS (
  SELECT
    d.table_name,
    lower(btrim(d.title)) AS normalized_title,
    COUNT(*) AS record_count,
    jsonb_agg(
      jsonb_build_object('recordId', d.record_id, 'parentId', d.parent_id, 'title', d.title)
      ORDER BY d.record_id
    ) AS records
  FROM (
    SELECT 'Course'::text AS table_name, c."id"::text AS record_id,
           c."id"::text AS parent_id, c."title" AS title
    FROM "Course" c
    UNION ALL
    SELECT 'CourseModule', cm."id", cm."courseId", cm."title" FROM "CourseModule" cm
    UNION ALL
    SELECT 'Task', t."id", t."moduleId", t."title" FROM "Task" t
    UNION ALL
    SELECT 'Theme', th."id", th."moduleId", th."name" FROM "Theme" th
    UNION ALL
    SELECT 'Topic', tp."id", tp."themeId", tp."title" FROM "Topic" tp
    UNION ALL
    SELECT 'Essay', e."id", e."taskId", e."title" FROM "Essay" e
    UNION ALL
    SELECT 'PracticeSet', ps."id", ps."moduleId", ps."title" FROM "PracticeSet" ps
  ) d
  WHERE NULLIF(btrim(d.title), '') IS NOT NULL
  GROUP BY d.table_name, lower(btrim(d.title))
  HAVING COUNT(*) > 1
),
duplicate_content_candidates AS (
  SELECT
    d.table_name,
    d.field_name,
    d.content,
    COUNT(*) AS record_count,
    jsonb_agg(
      jsonb_build_object('recordId', d.record_id, 'parentId', d.parent_id, 'title', d.title)
      ORDER BY d.record_id
    ) AS records
  FROM (
    SELECT 'Topic'::text AS table_name, 'situation'::text AS field_name,
           tp."situation" AS content, tp."id"::text AS record_id,
           tp."themeId" AS parent_id, tp."title" AS title
    FROM "Topic" tp WHERE NULLIF(tp."situation", '') IS NOT NULL
    UNION ALL
    SELECT 'Topic', 'question', tp."question", tp."id", tp."themeId", tp."title"
    FROM "Topic" tp WHERE NULLIF(tp."question", '') IS NOT NULL
    UNION ALL
    SELECT 'Topic', 'modelAnswer', tp."modelAnswer", tp."id", tp."themeId", tp."title"
    FROM "Topic" tp WHERE NULLIF(tp."modelAnswer", '') IS NOT NULL
    UNION ALL
    SELECT 'Topic', 'extraInformation', tp."extraInformation", tp."id", tp."themeId", tp."title"
    FROM "Topic" tp WHERE NULLIF(tp."extraInformation", '') IS NOT NULL
    UNION ALL
    SELECT 'Topic', 'conclusion', tp."conclusion", tp."id", tp."themeId", tp."title"
    FROM "Topic" tp WHERE NULLIF(tp."conclusion", '') IS NOT NULL
    UNION ALL
    SELECT 'Essay', 'prompt', e."prompt", e."id", e."taskId", e."title"
    FROM "Essay" e WHERE NULLIF(e."prompt", '') IS NOT NULL
    UNION ALL
    SELECT 'Essay', 'content', e."content", e."id", e."taskId", e."title"
    FROM "Essay" e WHERE NULLIF(e."content", '') IS NOT NULL
    UNION ALL
    SELECT 'Essay', 'summary', e."summary", e."id", e."taskId", e."title"
    FROM "Essay" e WHERE NULLIF(e."summary", '') IS NOT NULL
    UNION ALL
    SELECT 'Essay', 'extraInformation', e."extraInformation", e."id", e."taskId", e."title"
    FROM "Essay" e WHERE NULLIF(e."extraInformation", '') IS NOT NULL
    UNION ALL
    SELECT 'Vocabulary', 'term', v."term", v."id", v."topicId", tp."title"
    FROM "Vocabulary" v
    LEFT JOIN "Topic" tp ON tp."id" = v."topicId"
    WHERE NULLIF(v."term", '') IS NOT NULL
    UNION ALL
    SELECT 'Vocabulary', 'meaning', v."meaning", v."id", v."topicId", tp."title"
    FROM "Vocabulary" v
    LEFT JOIN "Topic" tp ON tp."id" = v."topicId"
    WHERE NULLIF(v."meaning", '') IS NOT NULL
    UNION ALL
    SELECT 'GrammarNote', 'rule', g."rule", g."id", g."topicId", tp."title"
    FROM "GrammarNote" g
    LEFT JOIN "Topic" tp ON tp."id" = g."topicId"
    WHERE NULLIF(g."rule", '') IS NOT NULL
  ) d
  GROUP BY d.table_name, d.field_name, d.content
  HAVING COUNT(*) > 1
),
orphan_candidates AS (
  SELECT
    'CourseModule without Course'::text AS check_name,
    cm."id"::text AS record_id,
    jsonb_build_object('courseId', cm."courseId") AS data
  FROM "CourseModule" cm
  LEFT JOIN "Course" c ON c."id" = cm."courseId"
  WHERE c."id" IS NULL
  UNION ALL
  SELECT 'Task without CourseModule', t."id", jsonb_build_object('moduleId', t."moduleId")
  FROM "Task" t
  LEFT JOIN "CourseModule" cm ON cm."id" = t."moduleId"
  WHERE cm."id" IS NULL
  UNION ALL
  SELECT 'Theme without CourseModule', th."id", jsonb_build_object('moduleId', th."moduleId")
  FROM "Theme" th
  LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  WHERE cm."id" IS NULL
  UNION ALL
  SELECT 'Topic without Theme', tp."id", jsonb_build_object('themeId', tp."themeId")
  FROM "Topic" tp
  LEFT JOIN "Theme" th ON th."id" = tp."themeId"
  WHERE th."id" IS NULL
  UNION ALL
  SELECT 'Vocabulary without Topic', v."id", jsonb_build_object('topicId', v."topicId")
  FROM "Vocabulary" v
  LEFT JOIN "Topic" tp ON tp."id" = v."topicId"
  WHERE tp."id" IS NULL
  UNION ALL
  SELECT 'GrammarNote without Topic', g."id", jsonb_build_object('topicId', g."topicId")
  FROM "GrammarNote" g
  LEFT JOIN "Topic" tp ON tp."id" = g."topicId"
  WHERE tp."id" IS NULL
  UNION ALL
  SELECT 'ExamCriteria without Topic', ec."id", jsonb_build_object('topicId', ec."topicId")
  FROM "ExamCriteria" ec
  LEFT JOIN "Topic" tp ON tp."id" = ec."topicId"
  WHERE tp."id" IS NULL
  UNION ALL
  SELECT 'Essay without Task', e."id", jsonb_build_object('taskId', e."taskId")
  FROM "Essay" e
  LEFT JOIN "Task" t ON t."id" = e."taskId"
  WHERE t."id" IS NULL
  UNION ALL
  SELECT 'PracticeSet without CourseModule', ps."id", jsonb_build_object('moduleId', ps."moduleId")
  FROM "PracticeSet" ps
  LEFT JOIN "CourseModule" cm ON cm."id" = ps."moduleId"
  WHERE cm."id" IS NULL
  UNION ALL
  SELECT 'PracticeSet with missing Task', ps."id", jsonb_build_object('taskId', ps."taskId")
  FROM "PracticeSet" ps
  LEFT JOIN "Task" t ON t."id" = ps."taskId"
  WHERE ps."taskId" IS NOT NULL AND t."id" IS NULL
  UNION ALL
  SELECT 'PracticeQuestion without PracticeSet', pq."id",
         jsonb_build_object('practiceSetId', pq."practiceSetId")
  FROM "PracticeQuestion" pq
  LEFT JOIN "PracticeSet" ps ON ps."id" = pq."practiceSetId"
  WHERE ps."id" IS NULL
  UNION ALL
  SELECT 'Media without Topic', m."id", jsonb_build_object('topicId', m."topicId")
  FROM "Media" m
  LEFT JOIN "Topic" tp ON tp."id" = m."topicId"
  WHERE m."topicId" IS NOT NULL AND tp."id" IS NULL
  UNION ALL
  SELECT 'Media without Essay', m."id", jsonb_build_object('essayId', m."essayId")
  FROM "Media" m
  LEFT JOIN "Essay" e ON e."id" = m."essayId"
  WHERE m."essayId" IS NOT NULL AND e."id" IS NULL
  UNION ALL
  SELECT 'Media with no Topic or Essay reference', m."id",
         jsonb_build_object('key', m."key", 'topicId', m."topicId", 'essayId', m."essayId")
  FROM "Media" m
  WHERE m."topicId" IS NULL AND m."essayId" IS NULL
  UNION ALL
  SELECT 'Media with both Topic and Essay references', m."id",
         jsonb_build_object('key', m."key", 'topicId', m."topicId", 'essayId', m."essayId")
  FROM "Media" m
  WHERE m."topicId" IS NOT NULL AND m."essayId" IS NOT NULL
  UNION ALL
  SELECT 'Theme task belongs to another module', th."id",
         jsonb_build_object('moduleId', th."moduleId", 'taskId', th."taskId",
                            'taskModuleId', t."moduleId")
  FROM "Theme" th
  JOIN "Task" t ON t."id" = th."taskId"
  WHERE t."moduleId" <> th."moduleId"
  UNION ALL
  SELECT 'PracticeSet task belongs to another module', ps."id",
         jsonb_build_object('moduleId', ps."moduleId", 'taskId', ps."taskId",
                            'taskModuleId', t."moduleId")
  FROM "PracticeSet" ps
  JOIN "Task" t ON t."id" = ps."taskId"
  WHERE t."moduleId" <> ps."moduleId"
  UNION ALL
  SELECT 'Task introVideoMediaId has no Media row', t."id",
         jsonb_build_object('introVideoMediaId', t."introVideoMediaId")
  FROM "Task" t
  LEFT JOIN "Media" m ON m."id" = t."introVideoMediaId"
  WHERE t."introVideoMediaId" IS NOT NULL AND m."id" IS NULL
  UNION ALL
  SELECT 'PracticeQuestion audioMediaId has no Media row', pq."id",
         jsonb_build_object('audioMediaId', pq."audioMediaId")
  FROM "PracticeQuestion" pq
  LEFT JOIN "Media" m ON m."id" = pq."audioMediaId"
  WHERE pq."audioMediaId" IS NOT NULL AND m."id" IS NULL
),
audit_rows AS (
  SELECT
    'table_count'::text AS section,
    table_name AS record_id,
    jsonb_build_object('tableName', table_name, 'recordCount', record_count) AS data
  FROM table_counts

  UNION ALL
  SELECT gr.section, gr.record_id, gr.data
  FROM grouping_rows gr

  UNION ALL
  SELECT 'course', c."id", to_jsonb(c)
  FROM "Course" c

  UNION ALL
  SELECT 'course_module', cm."id",
         jsonb_build_object(
           'module', to_jsonb(cm),
           'courseId', c."id",
           'courseSlug', c."slug",
           'courseTitle', c."title'
         )
  FROM "CourseModule" cm
  LEFT JOIN "Course" c ON c."id" = cm."courseId"

  UNION ALL
  SELECT 'speaking_task', tr.record_id, tr.data
  FROM task_rows tr

  UNION ALL
  SELECT 'theme_topic_relationship', rr.record_id, rr.data
  FROM theme_topic_rows rr

  UNION ALL
  SELECT
    'speaking_topic',
    stc.topic_id,
    jsonb_build_object(
      'courseId', stc.course_id,
      'courseSlug', stc.course_slug,
      'moduleId', stc.module_id,
      'moduleSlug', stc.module_slug,
      'moduleSkill', stc.module_skill,
      'taskId', stc.task_id,
      'taskType', stc.task_type,
      'themeId', stc.theme_id,
      'themeSlug', stc.theme_slug,
      'themeName', stc.theme_name,
      'themeTaskId', stc.theme_task_id,
      'topicId', tp."id",
      'topicSlug', tp."slug",
      'title', tp."title",
      'situation', tp."situation",
      'question', tp."question",
      'modelAnswer', tp."modelAnswer",
      'extraInformation', tp."extraInformation",
      'conclusion', tp."conclusion",
      'sortOrder', tp."sortOrder",
      'status', tp."status"::text,
      'publishedAt', tp."publishedAt",
      'createdAt', tp."createdAt",
      'updatedAt', tp."updatedAt"
    )
  FROM speaking_topic_context stc
  JOIN "Topic" tp ON tp."id" = stc.topic_id

  UNION ALL
  SELECT
    'task2_topic',
    tp."id",
    jsonb_build_object(
      'courseId', c."id",
      'courseSlug', c."slug",
      'moduleId', cm."id",
      'taskId', t."id",
      'taskType', t."type"::text,
      'themeId', th."id",
      'themeSlug', th."slug",
      'themeName', th."name",
      'topicId', tp."id",
      'topicSlug', tp."slug",
      'title', tp."title",
      'situation', tp."situation",
      'question', tp."question",
      'modelAnswer', tp."modelAnswer",
      'extraInformation', tp."extraInformation",
      'conclusion', tp."conclusion",
      'sortOrder', tp."sortOrder",
      'status', tp."status"::text,
      'publishedAt', tp."publishedAt"
    )
  FROM "Task" t
  JOIN "CourseModule" cm ON cm."id" = t."moduleId"
  JOIN "Course" c ON c."id" = cm."courseId"
  JOIN "Theme" th ON th."taskId" = t."id"
  JOIN "Topic" tp ON tp."themeId" = th."id"
  WHERE t."type" = 'TASK2'

  UNION ALL
  SELECT
    'essay',
    e."id",
    jsonb_build_object(
      'essayId', e."id",
      'taskId', e."taskId",
      'taskType', t."type"::text,
      'moduleId', cm."id",
      'courseId', c."id",
      'slug', e."slug",
      'title', e."title",
      'prompt', e."prompt",
      'content', e."content",
      'summary', e."summary",
      'extraInformation', e."extraInformation",
      'sortOrder', e."sortOrder",
      'status', e."status"::text,
      'publishedAt', e."publishedAt",
      'media', COALESCE((
        SELECT jsonb_agg(to_jsonb(m) ORDER BY m."id")
        FROM "Media" m WHERE m."essayId" = e."id"
      ), '[]'::jsonb)
    )
  FROM "Essay" e
  LEFT JOIN "Task" t ON t."id" = e."taskId"
  LEFT JOIN "CourseModule" cm ON cm."id" = t."moduleId"
  LEFT JOIN "Course" c ON c."id" = cm."courseId"

  UNION ALL
  SELECT
    'vocabulary',
    v."id",
    jsonb_build_object(
      'vocabularyId', v."id",
      'topicId', tp."id",
      'topicSlug', tp."slug",
      'topicTitle', tp."title",
      'themeId', th."id",
      'themeName', th."name",
      'moduleId', cm."id",
      'moduleSkill', cm."skill"::text,
      'taskId', t."id",
      'taskType', t."type"::text,
      'term', v."term",
      'meaning', v."meaning",
      'example', v."example",
      'sortOrder', v."sortOrder"
    )
  FROM "Vocabulary" v
  LEFT JOIN "Topic" tp ON tp."id" = v."topicId"
  LEFT JOIN "Theme" th ON th."id" = tp."themeId"
  LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  LEFT JOIN "Task" t ON t."id" = th."taskId"
  WHERE cm."skill" = 'SPEAKING'
     OR t."type" IN ('TASK1', 'TASK2', 'TASK3')

  UNION ALL
  SELECT
    'grammar_note',
    g."id",
    jsonb_build_object(
      'grammarNoteId', g."id",
      'topicId', tp."id",
      'topicSlug', tp."slug",
      'topicTitle', tp."title",
      'themeId', th."id",
      'themeName', th."name",
      'moduleId', cm."id",
      'moduleSkill', cm."skill"::text,
      'taskId', t."id",
      'taskType', t."type"::text,
      'rule', g."rule",
      'explanation', g."explanation",
      'example', g."example",
      'sortOrder', g."sortOrder"
    )
  FROM "GrammarNote" g
  LEFT JOIN "Topic" tp ON tp."id" = g."topicId"
  LEFT JOIN "Theme" th ON th."id" = tp."themeId"
  LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  LEFT JOIN "Task" t ON t."id" = th."taskId"
  WHERE cm."skill" = 'SPEAKING'
     OR t."type" IN ('TASK1', 'TASK2', 'TASK3')

  UNION ALL
  SELECT
    'exam_criteria',
    ec."id",
    jsonb_build_object(
      'examCriteriaId', ec."id",
      'topicId', tp."id",
      'topicSlug', tp."slug",
      'topicTitle', tp."title",
      'themeId', th."id",
      'themeName', th."name",
      'taskId', t."id",
      'taskType', t."type"::text,
      'lexicalResources', ec."lexicalResources",
      'grammar', ec."grammar",
      'coherence', ec."coherence",
      'taskFulfillment', ec."taskFulfillment",
      'relevance', ec."relevance"
    )
  FROM "ExamCriteria" ec
  LEFT JOIN "Topic" tp ON tp."id" = ec."topicId"
  LEFT JOIN "Theme" th ON th."id" = tp."themeId"
  LEFT JOIN "CourseModule" cm ON cm."id" = th."moduleId"
  LEFT JOIN "Task" t ON t."id" = th."taskId"
  WHERE cm."skill" = 'SPEAKING'
     OR t."type" IN ('TASK1', 'TASK2', 'TASK3')

  UNION ALL
  SELECT
    'media',
    m."id",
    jsonb_build_object(
      'mediaId', m."id",
      'key', m."key",
      'type', m."type",
      'mimeType', m."mimeType",
      'sizeBytes', m."sizeBytes",
      'durationSeconds', m."durationSeconds",
      'checksum', m."checksum",
      'isProtected', m."isProtected",
      'topicId', m."topicId",
      'topicTitle', tp."title",
      'themeId', th."id",
      'topicTaskType', tt."type"::text,
      'essayId', m."essayId",
      'essayTitle', e."title",
      'essayTaskType', et."type"::text,
      'createdAt', m."createdAt"
    )
  FROM "Media" m
  LEFT JOIN "Topic" tp ON tp."id" = m."topicId"
  LEFT JOIN "Theme" th ON th."id" = tp."themeId"
  LEFT JOIN "CourseModule" topic_cm ON topic_cm."id" = th."moduleId"
  LEFT JOIN "Task" tt ON tt."id" = th."taskId"
  LEFT JOIN "Essay" e ON e."id" = m."essayId"
  LEFT JOIN "Task" et ON et."id" = e."taskId"

  UNION ALL
  SELECT
    'practice_set',
    ps."id",
    jsonb_build_object(
      'practiceSet', to_jsonb(ps),
      'moduleSkill', cm."skill"::text,
      'taskType', t."type"::text
    )
  FROM "PracticeSet" ps
  JOIN "CourseModule" cm ON cm."id" = ps."moduleId"
  LEFT JOIN "Task" t ON t."id" = ps."taskId"

  UNION ALL
  SELECT
    'practice_question',
    pq."id",
    jsonb_build_object(
      'practiceQuestion', to_jsonb(pq),
      'practiceSetId', ps."id",
      'practiceSetTitle', ps."title",
      'taskId', ps."taskId",
      'taskType', t."type"::text,
      'moduleId', cm."id",
      'moduleSkill', cm."skill"::text
    )
  FROM "PracticeQuestion" pq
  JOIN "PracticeSet" ps ON ps."id" = pq."practiceSetId"
  JOIN "CourseModule" cm ON cm."id" = ps."moduleId"
  LEFT JOIN "Task" t ON t."id" = ps."taskId"

  UNION ALL
  SELECT
    'content_audit_log_import',
    cal."id",
    jsonb_build_object(
      'auditLogId', cal."id",
      'resource', cal."resource",
      'resourceId', cal."resourceId",
      'action', cal."action",
      'actorId', cal."actorId",
      'snapshot', cal."snapshot",
      'createdAt', cal."createdAt"
    )
  FROM "ContentAuditLog" cal
  WHERE cal."action" = 'IMPORTED'
     OR cal."action" ILIKE '%IMPORT%'

  UNION ALL
  SELECT
    'duplicate_slug_candidate',
    dsc.table_name || ':' || dsc.duplicate_key,
    jsonb_build_object(
      'tableName', dsc.table_name,
      'duplicateSlug', dsc.duplicate_key,
      'recordCount', dsc.record_count,
      'records', dsc.records
    )
  FROM duplicate_slug_candidates dsc

  UNION ALL
  SELECT
    'duplicate_title_candidate',
    dtc.table_name || ':' || dtc.normalized_title,
    jsonb_build_object(
      'tableName', dtc.table_name,
      'normalizedTitle', dtc.normalized_title,
      'recordCount', dtc.record_count,
      'records', dtc.records
    )
  FROM duplicate_title_candidates dtc

  UNION ALL
  SELECT
    'duplicate_content_candidate',
    dcc.table_name || ':' || dcc.field_name || ':' || md5(dcc.content),
    jsonb_build_object(
      'tableName', dcc.table_name,
      'fieldName', dcc.field_name,
      'content', dcc.content,
      'recordCount', dcc.record_count,
      'records', dcc.records
    )
  FROM duplicate_content_candidates dcc

  UNION ALL
  SELECT 'orphan_or_relationship_candidate', oc.check_name || ':' || oc.record_id, oc.data
  FROM orphan_candidates oc
)
SELECT section, record_id, data
FROM audit_rows
ORDER BY section, record_id;
