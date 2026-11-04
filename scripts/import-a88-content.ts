import "reflect-metadata";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ContentStatus,
  CourseSkill,
  Prisma,
  PrismaClient,
  Role,
  TaskFormat,
  TaskType,
} from "@prisma/client";
import { parseCmsInput } from "../src/admin/cms.dto";

type ImportedTopic = {
  slug: string;
  title: string;
  situation: string | null;
  question: string | null;
  extraInformation: string | null;
  sourcePages: number[];
};

type ContentBundle = {
  source: string;
  courseSlug: string;
  moduleSkill: CourseSkill;
  taskType: TaskType;
  theme: { slug: string; name: string };
  topics: ImportedTopic[];
};

const db = new PrismaClient();

async function main() {
  const bundlePath = resolve(process.cwd(), "prisma/imports/a88-il-dort.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8")) as ContentBundle;
  if (!Array.isArray(bundle.topics) || bundle.topics.length === 0) {
    throw new Error("The content bundle contains no scenarios");
  }

  const actor = await db.user.findFirst({
    // The currently configured production database only has the ADMIN enum
    // value; avoid querying a newer role value until its migration is applied.
    where: { isActive: true, role: Role.ADMIN },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!actor) throw new Error("No active admin account is available for the import audit log");

  const result = await db.$transaction(async (tx) => {
    const course = await tx.course.upsert({
      where: { slug: bundle.courseSlug },
      update: { status: ContentStatus.PUBLISHED },
      create: {
        slug: bundle.courseSlug,
        title: "French Exam Preparation",
        description: "Independent French exam preparation platform.",
        status: ContentStatus.PUBLISHED,
        isFree: true,
        publishedAt: new Date(),
      },
    });
    const module = await tx.courseModule.upsert({
      where: { courseId_skill: { courseId: course.id, skill: bundle.moduleSkill } },
      update: { status: ContentStatus.PUBLISHED },
      create: {
        courseId: course.id,
        slug: "expression-orale",
        title: "Expression Orale",
        skill: CourseSkill.SPEAKING,
        examLabel: "3 tasks · 12 minutes",
        durationMinutes: 12,
        questionCount: 3,
        status: ContentStatus.PUBLISHED,
      },
    });
    const task = await tx.task.upsert({
      where: { moduleId_type: { moduleId: module.id, type: bundle.taskType } },
      update: { status: ContentStatus.PUBLISHED },
      create: {
        moduleId: module.id,
        type: TaskType.TASK2,
        format: TaskFormat.SPEAKING_INTERACTION,
        title: "Interaction on a given theme",
        description: "Ask questions in a realistic situation to obtain information.",
        durationMinutes: 4,
        questionCount: bundle.topics.length,
        sortOrder: 2,
        status: ContentStatus.PUBLISHED,
      },
    });
    const theme = await tx.theme.upsert({
      where: { moduleId_slug: { moduleId: module.id, slug: bundle.theme.slug } },
      update: { taskId: task.id, status: ContentStatus.PUBLISHED },
      create: {
        moduleId: module.id,
        taskId: task.id,
        slug: bundle.theme.slug,
        name: bundle.theme.name,
        status: ContentStatus.PUBLISHED,
      },
    });

    let imported = 0;
    let updated = 0;
    for (const [index, source] of bundle.topics.entries()) {
      const topicData = parseCmsInput("topics", {
        slug: source.slug,
        title: source.title,
        themeId: theme.id,
        situation: source.situation,
        question: source.question,
        extraInformation: source.extraInformation,
        status: ContentStatus.DRAFT,
        sortOrder: index,
      });
      const prior = await tx.topic.findUnique({
        where: { themeId_slug: { themeId: theme.id, slug: source.slug } },
        select: {
          id: true,
          title: true,
          situation: true,
          question: true,
          extraInformation: true,
          status: true,
          publishedAt: true,
        },
      });
      const changed = !prior || prior.title !== topicData.title ||
        prior.situation !== (topicData.situation as string | null) ||
        prior.question !== (topicData.question as string | null) ||
        prior.extraInformation !== (topicData.extraInformation as string | null) ||
        prior.status !== ContentStatus.PUBLISHED;
      const topic = await tx.topic.upsert({
        where: { themeId_slug: { themeId: theme.id, slug: source.slug } },
        update: {
          title: topicData.title as string,
          situation: topicData.situation as string | null,
          question: topicData.question as string | null,
          extraInformation: topicData.extraInformation as string | null,
          status: ContentStatus.PUBLISHED,
          publishedAt: prior?.publishedAt ?? new Date(),
          sortOrder: index,
        },
        create: {
          themeId: theme.id,
          ...(topicData as Prisma.TopicUncheckedCreateInput),
          status: ContentStatus.PUBLISHED,
          publishedAt: new Date(),
          sortOrder: index,
        },
      });
      if (!prior) imported++;
      else if (changed) updated++;

      if (changed) await tx.contentAuditLog.create({
        data: {
          resource: "topics",
          resourceId: topic.id,
          action: "IMPORTED",
          actorId: actor.id,
          snapshot: JSON.parse(JSON.stringify(topic)) as Prisma.InputJsonValue,
        },
      });
    }
    return { imported, updated, total: bundle.topics.length };
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    maxWait: 15_000,
    timeout: 120_000,
  });

  console.log(`Imported ${result.imported} new scenarios; refreshed ${result.updated}; total ${result.total}.`);
  console.log("Published under French Exam Preparation → Expression Orale → Task 2 → A88 Il dort — scénarios.");
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
