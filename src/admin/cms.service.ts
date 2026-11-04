import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import {
  CmsListQueryDto,
  CmsResource,
  parseCmsInput,
} from "./cms.dto";

type Tx = Prisma.TransactionClient;
type CmsDataClient = Pick<
  Tx,
  | "course"
  | "courseModule"
  | "task"
  | "theme"
  | "topic"
  | "practiceSet"
  | "practiceQuestion"
  | "essay"
  | "vocabulary"
  | "grammarNote"
  | "examCriteria"
>;
type CmsRecord = { id: string; status?: ContentStatus; [key: string]: unknown };

const searchable = (search?: string) =>
  search
    ? {
        contains: search,
        mode: Prisma.QueryMode.insensitive,
      }
    : undefined;

function snapshot(record: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
}

function identity(record: unknown): CmsRecord {
  return record as CmsRecord;
}

/** Normalize query values again at the persistence boundary. HTTP query values
 * are strings, and service methods can also be called without Nest's pipe. */
function boundedInteger(
  value: unknown,
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const normalized = value === undefined || value === null || value === ""
    ? fallback
    : typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : Number.NaN;

  if (!Number.isSafeInteger(normalized) || normalized < min || normalized > max) {
    throw new BadRequestException(`${name} must be an integer between ${min} and ${max}`);
  }
  return normalized;
}

@Injectable()
export class CmsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async dashboard() {
    const [
      courses,
      modules,
      tasks,
      themes,
      topics,
      practiceSets,
      vocabulary,
      grammar,
      essays,
      courseStatuses,
      moduleStatuses,
      taskStatuses,
      themeStatuses,
      topicStatuses,
      setStatuses,
      essayStatuses,
      recent,
    ] = await Promise.all([
      this.db.course.count(),
      this.db.courseModule.count(),
      this.db.task.count(),
      this.db.theme.count(),
      this.db.topic.count(),
      this.db.practiceSet.count(),
      this.db.vocabulary.count(),
      this.db.grammarNote.count(),
      this.db.essay.count(),
      this.db.course.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.courseModule.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.task.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.theme.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.topic.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.practiceSet.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.essay.groupBy({ by: ["status"], _count: { _all: true } }),
      this.db.contentAuditLog.findMany({
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          resource: true,
          resourceId: true,
          action: true,
          actorId: true,
          snapshot: true,
          createdAt: true,
        },
      }),
    ]);

    const statuses = [
      ...courseStatuses,
      ...moduleStatuses,
      ...taskStatuses,
      ...themeStatuses,
      ...topicStatuses,
      ...setStatuses,
      ...essayStatuses,
    ];
    const countStatus = (status: ContentStatus) =>
      statuses.reduce(
        (total, row) => total + (row.status === status ? row._count._all : 0),
        0,
      );
    const published = countStatus(ContentStatus.PUBLISHED);
    const draft = countStatus(ContentStatus.DRAFT);
    const review = countStatus(ContentStatus.REVIEW);
    const archived = countStatus(ContentStatus.ARCHIVED);

    return {
      totals: {
        courses,
        modules,
        tasks,
        themes,
        topics,
        scenarios: themes,
        practiceSets,
        vocabulary,
        grammarNotes: grammar,
        essays,
      },
      publication: {
        published,
        draft,
        review,
        archived,
      },
      requiringAttention: review,
      recentlyUpdated: recent,
    };
  }

  async list(resource: CmsResource, query: CmsListQueryDto) {
    if (
      query.status &&
      !new Set<CmsResource>([
        "courses",
        "modules",
        "tasks",
        "themes",
        "topics",
        "practice-sets",
        "essays",
      ]).has(resource)
    ) {
      throw new BadRequestException(
        "This content type inherits status from its parent",
      );
    }
    const page = boundedInteger(query.page, "page", 1, 1, 1_000_000);
    const pageSize = boundedInteger(query.pageSize, "pageSize", 20, 1, 100);
    const skip = (page - 1) * pageSize;
    const term = searchable(query.search);
    const status = query.status;
    let items: unknown[];
    let total: number;

    switch (resource) {
      case "courses": {
        const where: Prisma.CourseWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ title: term }, { slug: term }, { description: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.course.findMany({
            where,
            orderBy: [{ updatedAt: "desc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: { _count: { select: { modules: true } } },
          }),
          this.db.course.count({ where }),
        ]);
        break;
      }
      case "modules": {
        const where: Prisma.CourseModuleWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ title: term }, { slug: term }, { description: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.courseModule.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: {
              course: { select: { id: true, title: true } },
              _count: { select: { tasks: true, themes: true } },
            },
          }),
          this.db.courseModule.count({ where }),
        ]);
        break;
      }
      case "tasks": {
        const where: Prisma.TaskWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ title: term }, { description: term }, { instructions: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.task.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: {
              module: { select: { id: true, title: true, courseId: true } },
              _count: { select: { themes: true, essays: true } },
            },
          }),
          this.db.task.count({ where }),
        ]);
        break;
      }
      case "themes": {
        const where: Prisma.ThemeWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ name: term }, { slug: term }, { description: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.theme.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            skip,
            take: pageSize,
            include: {
              module: { select: { id: true, title: true } },
              task: { select: { id: true, title: true } },
              _count: { select: { topics: true } },
            },
          }),
          this.db.theme.count({ where }),
        ]);
        break;
      }
      case "topics": {
        const where: Prisma.TopicWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? {
                OR: [
                  { title: term },
                  { slug: term },
                  { question: term },
                  { situation: term },
                ],
              }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.topic.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: {
              theme: { select: { id: true, name: true, moduleId: true } },
              _count: { select: { vocabulary: true, grammar: true } },
            },
          }),
          this.db.topic.count({ where }),
        ]);
        break;
      }
      case "practice-sets": {
        const where: Prisma.PracticeSetWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ title: term }, { slug: term }, { description: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.practiceSet.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: {
              module: { select: { id: true, title: true } },
              task: { select: { id: true, title: true } },
              _count: { select: { questions: true } },
            },
          }),
          this.db.practiceSet.count({ where }),
        ]);
        break;
      }
      case "practice-questions": {
        const where: Prisma.PracticeQuestionWhereInput = term
          ? { prompt: term }
          : {};
        [items, total] = await Promise.all([
          this.db.practiceQuestion.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
            skip,
            take: pageSize,
            include: { practiceSet: { select: { id: true, title: true } } },
          }),
          this.db.practiceQuestion.count({ where }),
        ]);
        break;
      }
      case "essays": {
        const where: Prisma.EssayWhereInput = {
          ...(status ? { status } : {}),
          ...(term
            ? { OR: [{ title: term }, { slug: term }, { prompt: term }] }
            : {}),
        };
        [items, total] = await Promise.all([
          this.db.essay.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            skip,
            take: pageSize,
            include: { task: { select: { id: true, title: true, moduleId: true } } },
          }),
          this.db.essay.count({ where }),
        ]);
        break;
      }
      case "vocabulary": {
        const where: Prisma.VocabularyWhereInput = term
          ? { OR: [{ term }, { meaning: term }, { example: term }] }
          : {};
        [items, total] = await Promise.all([
          this.db.vocabulary.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { term: "asc" }],
            skip,
            take: pageSize,
            include: { topic: { select: { id: true, title: true } } },
          }),
          this.db.vocabulary.count({ where }),
        ]);
        break;
      }
      case "grammar": {
        const where: Prisma.GrammarNoteWhereInput = term
          ? { OR: [{ rule: term }, { explanation: term }, { example: term }] }
          : {};
        [items, total] = await Promise.all([
          this.db.grammarNote.findMany({
            where,
            orderBy: [{ sortOrder: "asc" }, { rule: "asc" }],
            skip,
            take: pageSize,
            include: { topic: { select: { id: true, title: true } } },
          }),
          this.db.grammarNote.count({ where }),
        ]);
        break;
      }
      case "exam-criteria": {
        const where: Prisma.ExamCriteriaWhereInput = term
          ? {
              OR: [
                { lexicalResources: term },
                { grammar: term },
                { coherence: term },
                { relevance: term },
              ],
            }
          : {};
        [items, total] = await Promise.all([
          this.db.examCriteria.findMany({
            where,
            orderBy: { topicId: "asc" },
            skip,
            take: pageSize,
            include: { topic: { select: { id: true, title: true } } },
          }),
          this.db.examCriteria.count({ where }),
        ]);
        break;
      }
    }

    return { items, total, page, pageSize, pageCount: Math.ceil(total / pageSize) };
  }

  async create(resource: CmsResource, body: unknown, actorId: string) {
    const input = parseCmsInput(resource, body);
    if (
      "status" in input &&
      input.status !== undefined &&
      input.status !== ContentStatus.DRAFT
    ) {
      throw new BadRequestException("New content must start as a draft");
    }

    return this.withAudit(resource, actorId, "CREATED", async (tx) => {
      await this.validateRelations(tx, resource, input);
      await this.demoteNewChildParent(tx, resource, input);
      return this.createRecord(tx, resource, input);
    });
  }

  async update(
    resource: CmsResource,
    id: string,
    body: unknown,
    actorId: string,
  ) {
    const input = parseCmsInput(resource, body, true);
    if ("status" in input) {
      throw new BadRequestException(
        "Use publish or archive actions to change publication status",
      );
    }

    return this.withAudit(resource, actorId, "UPDATED", async (tx) => {
      await this.validateRelations(tx, resource, input, id);
      return this.updateRecord(tx, resource, id, input);
    });
  }

  async publish(resource: CmsResource, id: string, actorId: string) {
    return this.withAudit(resource, actorId, "PUBLISHED", async (tx) => {
      await this.assertPublishableParent(tx, resource, id);
      return this.updateStatus(tx, resource, id, ContentStatus.PUBLISHED);
    });
  }

  async archive(resource: CmsResource, id: string, actorId: string) {
    return this.withAudit(resource, actorId, "ARCHIVED", async (tx) =>
      this.updateStatus(tx, resource, id, ContentStatus.ARCHIVED),
    );
  }

  async remove(resource: CmsResource, id: string, actorId: string) {
    return this.withAudit(resource, actorId, "DELETED", async (tx) => {
      const record = await this.findRecord(tx, resource, id);
      await this.demoteCurrentChildParent(tx, resource, id);
      await this.assertNoDependents(tx, resource, id);
      await this.deleteRecord(tx, resource, id);
      return record;
    });
  }

  async exportContent(resource: CmsResource, offset: number, limit: number) {
    offset = boundedInteger(offset, "offset", 0, 0, Number.MAX_SAFE_INTEGER);
    limit = boundedInteger(limit, "limit", 1000, 1, 1000);
    const [records, total] = await Promise.all([
      this.exportResource(resource, offset, limit),
      this.exportCount(resource),
    ]);
    return {
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      resource,
      offset,
      limit,
      total,
      records,
    };
  }

  async previewImport(resource: CmsResource, rawRecords: unknown[]) {
    const rows: Array<{
      index: number;
      status: "new" | "existing" | "invalid" | "conflict";
      message?: string;
    }> = [];
    const seen = new Map<string, string>();

    for (const [index, raw] of rawRecords.entries()) {
      try {
        const input = this.importInput(resource, raw);
        await this.validateRelations(this.db, resource, input);
        const key = this.importKey(resource, input);
        const signature = JSON.stringify(input);
        const previous = seen.get(key);
        if (previous !== undefined) {
          rows.push({
            index,
            status: previous === signature ? "existing" : "conflict",
            ...(previous === signature
              ? { message: "Duplicate record in this import" }
              : { message: "Conflicting duplicate record in this import" }),
          });
          continue;
        }
        seen.set(key, signature);
        const recordId =
          typeof input.id === "string"
            ? await this.findRecordIfPresent(this.db, resource, input.id)
            : null;
        const exists = await this.importRecordExists(this.db, resource, input);
        if (recordId && !exists) {
          rows.push({
            index,
            status: "conflict",
            message: "The supplied ID belongs to a different existing record",
          });
          continue;
        }
        rows.push({
          index,
          status: exists ? "existing" : "new",
          ...(exists ? { message: "A record with this key already exists; it will be left unchanged" } : {}),
        });
      } catch (error) {
        rows.push({
          index,
          status: "invalid",
          message: error instanceof Error ? error.message : "Invalid record",
        });
      }
    }

    return {
      total: rows.length,
      newCount: rows.filter((row) => row.status === "new").length,
      existingCount: rows.filter((row) => row.status === "existing").length,
      invalidCount: rows.filter((row) => row.status === "invalid").length,
      conflictCount: rows.filter((row) => row.status === "conflict").length,
      rows,
    };
  }

  async importRecords(resource: CmsResource, rawRecords: unknown[], actorId: string) {
    const preview = await this.previewImport(resource, rawRecords);
    if (preview.invalidCount || preview.conflictCount) {
      throw new BadRequestException({
        message: "Resolve invalid and conflicting records before importing",
        preview,
      });
    }

    try {
      return await this.db.$transaction(
        async (tx) => {
          let imported = 0;
          let skipped = 0;
          for (const raw of rawRecords) {
            const input = this.importInput(resource, raw);
            if (await this.importRecordExists(tx, resource, input)) {
              skipped++;
              continue;
            }
            await this.validateRelations(tx, resource, input);
            await this.demoteNewChildParent(tx, resource, input);
            const created = await this.createRecord(tx, resource, input);
            const record = identity(created);
            await tx.contentAuditLog.create({
              data: {
                resource,
                resourceId: record.id,
                action: "IMPORTED",
                actorId,
                snapshot: snapshot(created),
              },
            });
            imported++;
          }
          return { imported, skipped };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(error.code)
      ) {
        throw new ConflictException(
          "Import conflicted with a concurrent content change. Preview the file again before retrying.",
        );
      }
      throw error;
    }
  }

  private async exportResource(
    resource: CmsResource,
    skip: number,
    take: number,
  ): Promise<unknown[]> {
    switch (resource) {
      case "courses": return this.db.course.findMany({ orderBy: [{ slug: "asc" }, { id: "asc" }], skip, take });
      case "modules": return this.db.courseModule.findMany({ orderBy: [{ courseId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "tasks": return this.db.task.findMany({ orderBy: [{ moduleId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "themes": return this.db.theme.findMany({ orderBy: [{ moduleId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "topics": return this.db.topic.findMany({ orderBy: [{ themeId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "practice-sets": return this.db.practiceSet.findMany({ orderBy: [{ moduleId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "practice-questions": return this.db.practiceQuestion.findMany({ orderBy: [{ practiceSetId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "essays": return this.db.essay.findMany({ orderBy: [{ taskId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "vocabulary": return this.db.vocabulary.findMany({ orderBy: [{ topicId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "grammar": return this.db.grammarNote.findMany({ orderBy: [{ topicId: "asc" }, { sortOrder: "asc" }, { id: "asc" }], skip, take });
      case "exam-criteria": return this.db.examCriteria.findMany({ orderBy: [{ topicId: "asc" }, { id: "asc" }], skip, take });
    }
  }

  private exportCount(resource: CmsResource): Promise<number> {
    switch (resource) {
      case "courses": return this.db.course.count();
      case "modules": return this.db.courseModule.count();
      case "tasks": return this.db.task.count();
      case "themes": return this.db.theme.count();
      case "topics": return this.db.topic.count();
      case "practice-sets": return this.db.practiceSet.count();
      case "practice-questions": return this.db.practiceQuestion.count();
      case "essays": return this.db.essay.count();
      case "vocabulary": return this.db.vocabulary.count();
      case "grammar": return this.db.grammarNote.count();
      case "exam-criteria": return this.db.examCriteria.count();
    }
  }

  private importInput(
    resource: CmsResource,
    raw: unknown,
  ): Record<string, unknown> {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new BadRequestException("Each imported record must be a JSON object");
    }
    const {
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      publishedAt: _publishedAt,
      ...importable
    } = raw as Record<string, unknown>;
    const parsed = parseCmsInput(resource, importable);
    return {
      ...parsed,
      ...(parsed.status === undefined ? {} : { status: ContentStatus.DRAFT }),
    };
  }

  private importKey(resource: CmsResource, data: Record<string, unknown>) {
    switch (resource) {
      case "courses": return JSON.stringify([resource, data.slug]);
      case "modules": return JSON.stringify([resource, data.courseId, data.slug]);
      case "tasks": return JSON.stringify([resource, data.moduleId, data.type]);
      case "themes": return JSON.stringify([resource, data.moduleId, data.slug]);
      case "topics": return JSON.stringify([resource, data.themeId, data.slug]);
      case "practice-sets": return JSON.stringify([resource, data.moduleId, data.slug]);
      case "practice-questions": return JSON.stringify([resource, data.practiceSetId, data.prompt]);
      case "essays": return JSON.stringify([resource, data.taskId, data.slug]);
      case "vocabulary": return JSON.stringify([resource, data.topicId, data.term]);
      case "grammar": return JSON.stringify([resource, data.topicId, data.rule]);
      case "exam-criteria": return JSON.stringify([resource, data.topicId]);
    }
  }

  private async importRecordExists(tx: CmsDataClient, resource: CmsResource, data: Record<string, unknown>) {
    switch (resource) {
      case "courses":
        return Boolean(await tx.course.findUnique({ where: { slug: String(data.slug) }, select: { id: true } }));
      case "modules":
        return Boolean(await tx.courseModule.findUnique({ where: { courseId_slug: { courseId: String(data.courseId), slug: String(data.slug) } }, select: { id: true } }));
      case "tasks":
        return Boolean(await tx.task.findUnique({ where: { moduleId_type: { moduleId: String(data.moduleId), type: data.type as "TASK1" | "TASK2" | "TASK3" } }, select: { id: true } }));
      case "themes":
        return Boolean(await tx.theme.findUnique({ where: { moduleId_slug: { moduleId: String(data.moduleId), slug: String(data.slug) } }, select: { id: true } }));
      case "topics":
        return Boolean(await tx.topic.findUnique({ where: { themeId_slug: { themeId: String(data.themeId), slug: String(data.slug) } }, select: { id: true } }));
      case "practice-sets":
        return Boolean(await tx.practiceSet.findUnique({ where: { moduleId_slug: { moduleId: String(data.moduleId), slug: String(data.slug) } }, select: { id: true } }));
      case "practice-questions":
        return Boolean(await tx.practiceQuestion.findFirst({ where: { practiceSetId: String(data.practiceSetId), prompt: String(data.prompt) }, select: { id: true } }));
      case "essays":
        return Boolean(await tx.essay.findUnique({ where: { taskId_slug: { taskId: String(data.taskId), slug: String(data.slug) } }, select: { id: true } }));
      case "vocabulary":
        return Boolean(await tx.vocabulary.findFirst({ where: { topicId: String(data.topicId), term: String(data.term) }, select: { id: true } }));
      case "grammar":
        return Boolean(await tx.grammarNote.findFirst({ where: { topicId: String(data.topicId), rule: String(data.rule) }, select: { id: true } }));
      case "exam-criteria":
        return Boolean(await tx.examCriteria.findUnique({ where: { topicId: String(data.topicId) }, select: { id: true } }));
    }
  }

  private async withAudit<T>(
    resource: CmsResource,
    actorId: string,
    action: string,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        const result = await operation(tx);
        const record = identity(result);
        await tx.contentAuditLog.create({
          data: {
            resource,
            resourceId: record.id,
            action,
            actorId,
            snapshot: snapshot(result),
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("A record with these unique fields already exists");
      }
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        throw new BadRequestException("A related content record does not exist");
      }
      throw error;
    }
  }

  private async validateRelations(
    tx: CmsDataClient,
    resource: CmsResource,
    data: Record<string, unknown>,
    recordId?: string,
  ) {
    const exists = async (model: "course" | "courseModule" | "task" | "theme" | "topic" | "practiceSet", id: unknown) => {
      if (id === undefined) return;
      if (typeof id !== "string" || !(await this.relationExists(tx, model, id))) {
        throw new BadRequestException(`Related ${model} record was not found`);
      }
    };
    switch (resource) {
      case "modules": await exists("course", data.courseId); break;
      case "tasks": await exists("courseModule", data.moduleId); break;
      case "themes": {
        const current = recordId
          ? await tx.theme.findUnique({
              where: { id: recordId },
              select: { moduleId: true, taskId: true },
            })
          : null;
        const moduleId = data.moduleId ?? current?.moduleId;
        const taskId =
          data.taskId !== undefined ? data.taskId : current?.taskId;
        await exists("courseModule", moduleId);
        if (taskId) {
          await exists("task", taskId);
          const task = await tx.task.findUnique({
            where: { id: String(taskId) },
            select: { moduleId: true },
          });
          if (moduleId && task?.moduleId !== moduleId) {
            throw new BadRequestException(
              "The selected task belongs to another module",
            );
          }
        }
        break;
      }
      case "topics": await exists("theme", data.themeId); break;
      case "practice-sets": {
        const current = recordId
          ? await tx.practiceSet.findUnique({
              where: { id: recordId },
              select: { moduleId: true, taskId: true },
            })
          : null;
        const moduleId = data.moduleId ?? current?.moduleId;
        const taskId =
          data.taskId !== undefined ? data.taskId : current?.taskId;
        await exists("courseModule", moduleId);
        if (taskId) {
          await exists("task", taskId);
          const task = await tx.task.findUnique({
            where: { id: String(taskId) },
            select: { moduleId: true },
          });
          if (moduleId && task?.moduleId !== moduleId) {
            throw new BadRequestException(
              "The selected task belongs to another module",
            );
          }
        }
        break;
      }
      case "practice-questions": await exists("practiceSet", data.practiceSetId); break;
      case "essays": await exists("task", data.taskId); break;
      case "vocabulary":
      case "grammar":
      case "exam-criteria": await exists("topic", data.topicId); break;
      case "courses": break;
    }
  }

  private async demoteNewChildParent(
    tx: Tx,
    resource: CmsResource,
    data: Record<string, unknown>,
  ) {
    const parentId =
      resource === "practice-questions"
        ? data.practiceSetId
        : new Set<CmsResource>(["vocabulary", "grammar", "exam-criteria"]).has(resource)
          ? data.topicId
          : undefined;
    if (typeof parentId === "string") {
      await this.demoteInheritedParent(tx, resource, parentId);
    }
  }

  private async demoteCurrentChildParent(
    tx: Tx,
    resource: CmsResource,
    recordId: string,
    nextParentId?: string,
  ) {
    let currentParentId: string | undefined;
    if (resource === "practice-questions") {
      currentParentId = (
        await tx.practiceQuestion.findUnique({
          where: { id: recordId },
          select: { practiceSetId: true },
        })
      )?.practiceSetId;
    } else if (new Set<CmsResource>(["vocabulary", "grammar", "exam-criteria"]).has(resource)) {
      const child =
        resource === "vocabulary"
          ? await tx.vocabulary.findUnique({
              where: { id: recordId },
              select: { topicId: true },
            })
          : resource === "grammar"
            ? await tx.grammarNote.findUnique({
                where: { id: recordId },
                select: { topicId: true },
              })
            : await tx.examCriteria.findUnique({
                where: { id: recordId },
                select: { topicId: true },
              });
      currentParentId = child?.topicId;
    }
    if (!currentParentId) {
      if (
        resource === "practice-questions" ||
        new Set<CmsResource>(["vocabulary", "grammar", "exam-criteria"]).has(resource)
      ) {
        throw new NotFoundException("Content record not found");
      }
      return;
    }
    await this.demoteInheritedParent(tx, resource, currentParentId);
    if (nextParentId && nextParentId !== currentParentId) {
      await this.demoteInheritedParent(tx, resource, nextParentId);
    }
  }

  private async demoteInheritedParent(
    tx: Tx,
    childResource: CmsResource,
    parentId: string,
  ) {
    if (childResource === "practice-questions") {
      const parent = await tx.practiceSet.findUnique({
        where: { id: parentId },
        select: { status: true },
      });
      if (!parent) throw new NotFoundException("Parent content not found");
      if (parent.status === ContentStatus.PUBLISHED) {
        await tx.practiceSet.update({
          where: { id: parentId },
          data: { status: ContentStatus.REVIEW, publishedAt: null },
        });
      }
      return;
    }
    const parent = await tx.topic.findUnique({
      where: { id: parentId },
      select: { status: true },
    });
    if (!parent) throw new NotFoundException("Parent content not found");
    if (parent.status === ContentStatus.PUBLISHED) {
      await tx.topic.update({
        where: { id: parentId },
        data: { status: ContentStatus.REVIEW, publishedAt: null },
      });
    }
  }

  private async relationExists(
    tx: CmsDataClient,
    model: "course" | "courseModule" | "task" | "theme" | "topic" | "practiceSet",
    id: string,
  ): Promise<boolean> {
    switch (model) {
      case "course": return Boolean(await tx.course.findUnique({ where: { id }, select: { id: true } }));
      case "courseModule": return Boolean(await tx.courseModule.findUnique({ where: { id }, select: { id: true } }));
      case "task": return Boolean(await tx.task.findUnique({ where: { id }, select: { id: true } }));
      case "theme": return Boolean(await tx.theme.findUnique({ where: { id }, select: { id: true } }));
      case "topic": return Boolean(await tx.topic.findUnique({ where: { id }, select: { id: true } }));
      case "practiceSet": return Boolean(await tx.practiceSet.findUnique({ where: { id }, select: { id: true } }));
    }
  }

  private async createRecord(tx: Tx, resource: CmsResource, data: Record<string, unknown>) {
    switch (resource) {
      case "courses":
        return tx.course.create({ data: data as Prisma.CourseUncheckedCreateInput });
      case "modules":
        return tx.courseModule.create({ data: data as Prisma.CourseModuleUncheckedCreateInput });
      case "tasks":
        return tx.task.create({ data: data as Prisma.TaskUncheckedCreateInput });
      case "themes":
        return tx.theme.create({ data: data as Prisma.ThemeUncheckedCreateInput });
      case "topics":
        return tx.topic.create({ data: data as Prisma.TopicUncheckedCreateInput });
      case "practice-sets":
        return tx.practiceSet.create({ data: data as Prisma.PracticeSetUncheckedCreateInput });
      case "practice-questions":
        return tx.practiceQuestion.create({ data: data as Prisma.PracticeQuestionUncheckedCreateInput });
      case "essays":
        return tx.essay.create({ data: data as Prisma.EssayUncheckedCreateInput });
      case "vocabulary":
        return tx.vocabulary.create({ data: data as Prisma.VocabularyUncheckedCreateInput });
      case "grammar":
        return tx.grammarNote.create({ data: data as Prisma.GrammarNoteUncheckedCreateInput });
      case "exam-criteria":
        return tx.examCriteria.create({ data: data as Prisma.ExamCriteriaUncheckedCreateInput });
    }
  }

  private async updateRecord(
    tx: Tx,
    resource: CmsResource,
    id: string,
    input: Record<string, unknown>,
  ) {
    const data = Object.fromEntries(
      Object.entries(input).filter(([, value]) => value !== undefined),
    );
    switch (resource) {
      case "courses": {
        const current = await this.requireStatusRecord(tx.course, id);
        return tx.course.update({
          where: { id },
          data: { ...data, ...(current.status === "PUBLISHED" ? { status: "REVIEW" as const } : {}) } as Prisma.CourseUpdateInput,
        });
      }
      case "modules": {
        const current = await this.requireStatusRecord(tx.courseModule, id);
        return tx.courseModule.update({
          where: { id },
          data: { ...data, ...(current.status === "PUBLISHED" ? { status: "REVIEW" as const } : {}) } as Prisma.CourseModuleUpdateInput,
        });
      }
      case "tasks": {
        const current = await this.requireStatusRecord(tx.task, id);
        return tx.task.update({
          where: { id },
          data: { ...data, ...(current.status === "PUBLISHED" ? { status: "REVIEW" as const } : {}) } as Prisma.TaskUpdateInput,
        });
      }
      case "themes": {
        const current = await this.requireStatusRecord(tx.theme, id);
        return tx.theme.update({
          where: { id },
          data: { ...data, ...(current.status === "PUBLISHED" ? { status: "REVIEW" as const } : {}) } as Prisma.ThemeUpdateInput,
        });
      }
      case "topics": {
        const current = await this.requireStatusRecord(tx.topic, id);
        return tx.topic.update({
          where: { id },
          data: {
            ...data,
            ...(current.status === "PUBLISHED"
              ? { status: "REVIEW" as const, publishedAt: null }
              : {}),
          } as Prisma.TopicUpdateInput,
        });
      }
      case "practice-sets": {
        const current = await this.requireStatusRecord(tx.practiceSet, id);
        return tx.practiceSet.update({
          where: { id },
          data: {
            ...data,
            ...(current.status === "PUBLISHED"
              ? { status: "REVIEW" as const, publishedAt: null }
              : {}),
          } as Prisma.PracticeSetUpdateInput,
        });
      }
      case "essays": {
        const current = await this.requireStatusRecord(tx.essay, id);
        return tx.essay.update({
          where: { id },
          data: {
            ...data,
            ...(current.status === "PUBLISHED"
              ? { status: "REVIEW" as const, publishedAt: null }
              : {}),
          } as Prisma.EssayUpdateInput,
        });
      }
      case "practice-questions": {
        await this.demoteCurrentChildParent(
          tx,
          resource,
          id,
          typeof data.practiceSetId === "string" ? data.practiceSetId : undefined,
        );
        return tx.practiceQuestion.update({
          where: { id },
          data: data as Prisma.PracticeQuestionUpdateInput,
        });
      }
      case "vocabulary": {
        await this.demoteCurrentChildParent(
          tx,
          resource,
          id,
          typeof data.topicId === "string" ? data.topicId : undefined,
        );
        return tx.vocabulary.update({
          where: { id },
          data: data as Prisma.VocabularyUpdateInput,
        });
      }
      case "grammar": {
        await this.demoteCurrentChildParent(
          tx,
          resource,
          id,
          typeof data.topicId === "string" ? data.topicId : undefined,
        );
        return tx.grammarNote.update({
          where: { id },
          data: data as Prisma.GrammarNoteUpdateInput,
        });
      }
      case "exam-criteria": {
        await this.demoteCurrentChildParent(
          tx,
          resource,
          id,
          typeof data.topicId === "string" ? data.topicId : undefined,
        );
        return tx.examCriteria.update({
          where: { id },
          data: data as Prisma.ExamCriteriaUpdateInput,
        });
      }
    }
  }

  private async requireStatusRecord(
    model: {
      findUnique: (args: {
        where: { id: string };
        select: { status: true };
      }) => Promise<{ status: ContentStatus } | null>;
  },
    id: string,
  ) {
    const record = await model.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!record) throw new NotFoundException("Content record not found");
    return record;
  }

  private async assertPublishableParent(tx: Tx, resource: CmsResource, id: string) {
    const assertPublished = (status: ContentStatus | undefined) => {
      if (status !== "PUBLISHED") {
        throw new BadRequestException(
          "Publish the parent course, module, and task before publishing this content",
        );
      }
    };
    switch (resource) {
      case "courses":
        await this.requireStatusRecord(tx.course, id);
        return;
      case "modules": {
        const record = await tx.courseModule.findUnique({
          where: { id },
          include: { course: { select: { status: true } } },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.course.status);
        return;
      }
      case "tasks": {
        const record = await tx.task.findUnique({
          where: { id },
          include: { module: { include: { course: { select: { status: true } } } } },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.module.course.status);
        assertPublished(record.module.status);
        return;
      }
      case "themes": {
        const record = await tx.theme.findUnique({
          where: { id },
          include: {
            module: { include: { course: { select: { status: true } } } },
            task: { select: { status: true } },
          },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.module.course.status);
        assertPublished(record.module.status);
        if (record.task) assertPublished(record.task.status);
        return;
      }
      case "topics": {
        const record = await tx.topic.findUnique({
          where: { id },
          include: {
            theme: {
              include: {
                module: { include: { course: { select: { status: true } } } },
                task: { select: { status: true } },
              },
            },
          },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.theme.module.course.status);
        assertPublished(record.theme.module.status);
        assertPublished(record.theme.status);
        if (record.theme.task) assertPublished(record.theme.task.status);
        return;
      }
      case "practice-sets": {
        const record = await tx.practiceSet.findUnique({
          where: { id },
          include: { module: { include: { course: { select: { status: true } } } } },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.module.course.status);
        assertPublished(record.module.status);
        return;
      }
      case "essays": {
        const record = await tx.essay.findUnique({
          where: { id },
          include: {
            task: { include: { module: { include: { course: { select: { status: true } } } } } },
          },
        });
        if (!record) throw new NotFoundException("Content record not found");
        assertPublished(record.task.module.course.status);
        assertPublished(record.task.module.status);
        assertPublished(record.task.status);
        return;
      }
      case "practice-questions":
      case "vocabulary":
      case "grammar":
      case "exam-criteria":
        throw new BadRequestException(
          "This content inherits publication from its parent and cannot be published separately",
        );
    }
  }

  private async updateStatus(
    tx: Tx,
    resource: CmsResource,
    id: string,
    status: ContentStatus,
  ) {
    const data = {
      status,
      ...(["topics", "practice-sets", "essays"].includes(resource)
        ? { publishedAt: status === "PUBLISHED" ? new Date() : null }
        : {}),
    };
    switch (resource) {
      case "courses":
        await this.requireStatusRecord(tx.course, id);
        return tx.course.update({ where: { id }, data });
      case "modules":
        await this.requireStatusRecord(tx.courseModule, id);
        return tx.courseModule.update({ where: { id }, data });
      case "tasks":
        await this.requireStatusRecord(tx.task, id);
        return tx.task.update({ where: { id }, data });
      case "themes":
        await this.requireStatusRecord(tx.theme, id);
        return tx.theme.update({ where: { id }, data });
      case "topics":
        await this.requireStatusRecord(tx.topic, id);
        return tx.topic.update({ where: { id }, data });
      case "practice-sets":
        await this.requireStatusRecord(tx.practiceSet, id);
        return tx.practiceSet.update({ where: { id }, data });
      case "essays":
        await this.requireStatusRecord(tx.essay, id);
        return tx.essay.update({ where: { id }, data });
      default:
        throw new BadRequestException("This content type has no publication status");
    }
  }

  private async findRecord(tx: Tx, resource: CmsResource, id: string) {
    const record = await this.findRecordIfPresent(tx, resource, id);
    if (!record) throw new NotFoundException("Content record not found");
    return record;
  }

  private async findRecordIfPresent(tx: CmsDataClient, resource: CmsResource, id: string) {
    switch (resource) {
      case "courses": return tx.course.findUnique({ where: { id } });
      case "modules": return tx.courseModule.findUnique({ where: { id } });
      case "tasks": return tx.task.findUnique({ where: { id } });
      case "themes": return tx.theme.findUnique({ where: { id } });
      case "topics": return tx.topic.findUnique({ where: { id } });
      case "practice-sets": return tx.practiceSet.findUnique({ where: { id } });
      case "practice-questions": return tx.practiceQuestion.findUnique({ where: { id } });
      case "essays": return tx.essay.findUnique({ where: { id } });
      case "vocabulary": return tx.vocabulary.findUnique({ where: { id } });
      case "grammar": return tx.grammarNote.findUnique({ where: { id } });
      case "exam-criteria": return tx.examCriteria.findUnique({ where: { id } });
    }
  }

  private async assertNoDependents(tx: Tx, resource: CmsResource, id: string) {
    let count = 0;
    switch (resource) {
      case "courses":
        count =
          (await tx.courseModule.count({ where: { courseId: id } })) +
          (await tx.order.count({ where: { courseId: id } })) +
          (await tx.enrollment.count({ where: { courseId: id } }));
        break;
      case "modules":
        count =
          (await tx.task.count({ where: { moduleId: id } })) +
          (await tx.theme.count({ where: { moduleId: id } })) +
          (await tx.practiceSet.count({ where: { moduleId: id } }));
        break;
      case "tasks":
        count =
          (await tx.theme.count({ where: { taskId: id } })) +
          (await tx.essay.count({ where: { taskId: id } })) +
          (await tx.practiceSet.count({ where: { taskId: id } }));
        break;
      case "themes":
        count = await tx.topic.count({ where: { themeId: id } });
        break;
      case "topics":
        count =
          (await tx.vocabulary.count({ where: { topicId: id } })) +
          (await tx.grammarNote.count({ where: { topicId: id } })) +
          (await tx.examCriteria.count({ where: { topicId: id } })) +
          (await tx.media.count({ where: { topicId: id } })) +
          (await tx.progress.count({ where: { topicId: id } }));
        break;
      case "practice-sets":
        count = await tx.practiceQuestion.count({ where: { practiceSetId: id } });
        break;
      case "essays":
        count = await tx.media.count({ where: { essayId: id } });
        break;
      case "practice-questions":
      case "vocabulary":
      case "grammar":
      case "exam-criteria":
        break;
    }
    if (count > 0) {
      throw new ConflictException(
        "This record has related content or learner history. Archive it instead of deleting it.",
      );
    }
  }

  private async deleteRecord(tx: Tx, resource: CmsResource, id: string) {
    switch (resource) {
      case "courses": return tx.course.delete({ where: { id } });
      case "modules": return tx.courseModule.delete({ where: { id } });
      case "tasks": return tx.task.delete({ where: { id } });
      case "themes": return tx.theme.delete({ where: { id } });
      case "topics": return tx.topic.delete({ where: { id } });
      case "practice-sets": return tx.practiceSet.delete({ where: { id } });
      case "practice-questions": return tx.practiceQuestion.delete({ where: { id } });
      case "essays": return tx.essay.delete({ where: { id } });
      case "vocabulary": return tx.vocabulary.delete({ where: { id } });
      case "grammar": return tx.grammarNote.delete({ where: { id } });
      case "exam-criteria": return tx.examCriteria.delete({ where: { id } });
    }
  }
}
