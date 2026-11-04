import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ContentStatus, Prisma } from "@prisma/client";
import { z } from "zod";
import { PrismaService } from "../common/prisma.service";
import {
  extractSpeakingTopicsFromPdf,
  type ExtractedSpeakingSection,
  type SpeakingSectionType,
} from "./speaking-pdf.parser";

type Tx = Prisma.TransactionClient;

const optionalText = z.string().nullable().optional();
const requiredText = z.string().trim().min(1);
const order = z.number().int().min(0).max(100000);

const versionSchema = z.object({
  versionLabel: requiredText.max(80),
  sortOrder: order.optional(),
}).strict();
const sectionSchema = z.object({
  sectionType: requiredText.max(80),
  heading: z.string().max(300).nullable().optional(),
  content: z.string(),
  sortOrder: order.optional(),
}).strict();
const vocabularySchema = z.object({
  frenchTerm: requiredText.max(500),
  englishMeaning: optionalText,
  example: optionalText,
  sortOrder: order.optional(),
}).strict();
const grammarSchema = z.object({
  structure: requiredText.max(500),
  example: optionalText,
  purpose: optionalText,
  explanation: optionalText,
  sortOrder: order.optional(),
}).strict();
const importedSectionSchema = z.object({
  sectionType: requiredText.max(80),
  heading: z.string().max(300),
  content: z.string().max(250000),
  sortOrder: order,
}).strict();
const importedTopicSchema = z.object({
  title: requiredText.max(300),
  category: z.string().max(120),
  sourceText: z.string().min(1).max(250000),
  sections: z.array(importedSectionSchema).max(60),
}).strict();
const importBatchSchema = z.object({
  topics: z.array(importedTopicSchema).min(1).max(10),
  publishDetectedVersions: z.boolean().optional(),
}).strict();

type ImportTopic = z.infer<typeof importedTopicSchema>;
type ImportResult = {
  title: string;
  status: "SUCCESS" | "FAILED" | "SKIPPED";
  essayId?: string;
  published?: boolean;
  reason?: string;
};

const versionLabels: Record<string, string> = {
  CLB_7: "CLB 7",
  CLB_5_6: "CLB 5-6",
  SPEECH_PLAN: "Plan du discours",
  VOCABULARY: "Vocabulaire",
  GRAMMAR: "Grammaire",
  UNCLASSIFIED: "À vérifier",
};
const publishableSectionTypes = new Set([
  "CLB_7",
  "CLB_5_6",
  "SPEECH_PLAN",
  "VOCABULARY",
  "GRAMMAR",
]);

function importFingerprint(taskId: string, sourceText: string) {
  return createHash("sha256")
    .update(`${taskId}\0${sourceText.normalize("NFC").replace(/\r\n/g, "\n")}`, "utf8")
    .digest("hex");
}

function isTopicPrompt(section: ImportTopic["sections"][number], title: string) {
  if (section.sectionType !== "UNCLASSIFIED") return false;
  const normalize = (value: string) =>
    value
      .normalize("NFC")
      .replace(/^\s*(?:(?:sujet|topic|th[eè]me)\s*(?:n[º°o]\s*)?\d{1,2}\s*[:.)\-–]?\s*|\d{1,2}\s*[.)\-–]\s*)/i, "")
      .replace(/^[«“"]|[»”"]$/g, "")
      .trim()
      .replace(/\s+/g, " ")
      .toLocaleLowerCase("fr");
  return normalize(section.content) === normalize(title);
}

function groupImportSections(sections: ImportTopic["sections"], publish: boolean) {
  const grouped = new Map<string, Array<ImportTopic["sections"][number]>>();
  for (const section of sections) {
    const label = versionLabels[section.sectionType] ?? "À vérifier";
    grouped.set(label, [...(grouped.get(label) ?? []), section]);
  }
  return [...grouped.entries()].map(([versionLabel, groupedSections], sortOrder) => ({
    versionLabel,
    sortOrder,
    status: publish && versionLabel !== "À vérifier" ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
    sections: {
      create: groupedSections.map((section) => ({
        sectionType: section.sectionType as SpeakingSectionType,
        heading: section.heading || null,
        content: section.content,
        sortOrder: section.sortOrder,
      })),
    },
  }));
}

function parseInput<T extends z.ZodTypeAny>(schema: T, value: unknown): z.infer<T> {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
        .join("; "),
    );
  }
  return parsed.data;
}

function auditSnapshot(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class SpeakingCmsService {
  constructor(@Inject(PrismaService) private readonly db: PrismaService) {}

  async extractTask3Pdf(taskId: string, buffer: Buffer) {
    const task = await this.db.task.findUnique({
      where: { id: taskId },
      select: { id: true, type: true, module: { select: { skill: true } } },
    });
    if (!task || task.type !== "TASK3" || task.module.skill !== "SPEAKING") {
      throw new BadRequestException("Select a configured Task 3 speaking task before extracting topics");
    }
    return extractSpeakingTopicsFromPdf(buffer);
  }

  async importTask3Topics(taskId: string, value: unknown, actorId: string) {
    const input = parseInput(importBatchSchema, value);
    const task = await this.db.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        type: true,
        status: true,
        module: {
          select: {
            skill: true,
            status: true,
            course: { select: { status: true } },
          },
        },
      },
    });
    if (!task || task.type !== "TASK3" || task.module.skill !== "SPEAKING") {
      throw new BadRequestException("Select a configured Task 3 speaking task before importing topics");
    }
    const parentsPublished =
      task.status === ContentStatus.PUBLISHED &&
      task.module.status === ContentStatus.PUBLISHED &&
      task.module.course.status === ContentStatus.PUBLISHED;

    const results: ImportResult[] = [];
    for (const topic of input.topics) {
      const fingerprint = importFingerprint(taskId, topic.sourceText);
      try {
        const existing = await this.db.essay.findUnique({
          where: { sourceFingerprint: fingerprint },
          select: { id: true },
        });
        if (existing) {
          results.push({
            title: topic.title,
            status: "SKIPPED",
            essayId: existing.id,
            reason: "This content has already been imported.",
          });
          continue;
        }

        const essay = await this.db.$transaction(async (tx) => {
          const nextOrder = await tx.essay.count({ where: { taskId } });
          const publishTopic =
            input.publishDetectedVersions === true &&
            parentsPublished &&
            topic.sections.some((section) => section.sectionType === "CLB_7" && section.content.trim()) &&
            topic.sections.every((section) =>
              section.content.trim() &&
              (publishableSectionTypes.has(section.sectionType) || isTopicPrompt(section, topic.title)),
            );
          const result = await tx.essay.create({
            data: {
              taskId,
              slug: `task-3-${fingerprint.slice(0, 32)}`,
              title: topic.title,
              prompt: topic.title,
              category: topic.category || null,
              sourceFingerprint: fingerprint,
              content: topic.sourceText,
              sortOrder: nextOrder,
              status: publishTopic ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
              publishedAt: publishTopic ? new Date() : null,
              versions: { create: groupImportSections(topic.sections, publishTopic) },
            },
          });
          await tx.contentAuditLog.create({
            data: {
              resource: "essay",
              resourceId: result.id,
              action: "IMPORTED_FROM_PDF",
              actorId,
              snapshot: auditSnapshot({
                id: result.id,
                taskId,
                category: topic.category || null,
                sourceFingerprint: fingerprint,
                status: publishTopic ? ContentStatus.PUBLISHED : ContentStatus.DRAFT,
                sectionCount: topic.sections.length,
              }),
            },
          });
          return result;
        });
        results.push({
          title: topic.title,
          status: "SUCCESS",
          essayId: essay.id,
          ...(input.publishDetectedVersions ? { published: essay.status === ContentStatus.PUBLISHED } : {}),
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          const existing = await this.db.essay.findUnique({
            where: { sourceFingerprint: fingerprint },
            select: { id: true },
          });
          if (existing) {
            results.push({
              title: topic.title,
              status: "SKIPPED",
              essayId: existing.id,
              reason: "This content was imported by another request.",
            });
            continue;
          }
        }
        results.push({
          title: topic.title,
          status: "FAILED",
          reason: error instanceof Error ? error.message : "The topic could not be imported.",
        });
      }
    }

    return {
      total: results.length,
      successful: results.filter((result) => result.status === "SUCCESS").length,
      failed: results.filter((result) => result.status === "FAILED").length,
      skipped: results.filter((result) => result.status === "SKIPPED").length,
      published: results.filter((result) => result.published).length,
      results,
    };
  }

  async content() {
    return this.db.courseModule.findMany({
      where: { skill: "SPEAKING" },
      orderBy: [{ course: { title: "asc" } }, { sortOrder: "asc" }],
      include: {
        course: { select: { id: true, slug: true, title: true } },
        tasks: {
          orderBy: [{ sortOrder: "asc" }, { type: "asc" }],
          include: {
            themes: {
              orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
              include: {
                topics: {
                  orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
                  include: {
                    vocabulary: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                    grammar: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                    criteria: true,
                    media: true,
                  },
                },
              },
            },
            essays: {
              orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
              include: {
                versions: {
                  orderBy: [{ sortOrder: "asc" }, { versionLabel: "asc" }],
                  include: {
                    sections: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                  },
                },
                vocabulary: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                grammarNotes: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                media: true,
              },
            },
          },
        },
        themes: {
          where: { taskId: null },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            topics: {
              orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
              include: {
                vocabulary: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                grammar: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }] },
                criteria: true,
                media: true,
              },
            },
          },
        },
      },
    });
  }

  async createVersion(essayId: string, value: unknown, actorId: string) {
    const data = parseInput(versionSchema, value);
    return this.audited("essay-version", "CREATED", actorId, async (tx) => {
      const essay = await tx.essay.findUnique({ where: { id: essayId }, select: { id: true } });
      if (!essay) throw new NotFoundException("Essay not found");
      return tx.essayVersion.create({
        data: { essayId, ...data },
      });
    });
  }

  async updateVersion(id: string, value: unknown, actorId: string) {
    const data = parseInput(versionSchema.partial(), value);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Provide at least one version field to update");
    }
    return this.audited("essay-version", "UPDATED", actorId, async (tx) => {
      const current = await tx.essayVersion.findUnique({
        where: { id },
        select: { id: true, status: true },
      });
      if (!current) throw new NotFoundException("Essay version not found");
      return tx.essayVersion.update({
        where: { id },
        data: {
          ...data,
          ...(current.status === ContentStatus.PUBLISHED
            ? { status: ContentStatus.REVIEW }
            : {}),
        },
      });
    });
  }

  async publishVersion(id: string, actorId: string) {
    return this.audited("essay-version", "PUBLISHED", actorId, async (tx) => {
      const version = await tx.essayVersion.findUnique({
        where: { id },
        include: {
          essay: {
            include: {
              task: { include: { module: { include: { course: true } } } },
            },
          },
          sections: { select: { id: true } },
        },
      });
      if (!version) throw new NotFoundException("Essay version not found");
      const { essay } = version;
      if (
        essay.status !== ContentStatus.PUBLISHED ||
        essay.task.status !== ContentStatus.PUBLISHED ||
        essay.task.module.status !== ContentStatus.PUBLISHED ||
        essay.task.module.course.status !== ContentStatus.PUBLISHED
      ) {
        throw new BadRequestException(
          "Publish the course, module, Task 3, and essay before publishing this version",
        );
      }
      if (version.sections.length === 0) {
        throw new BadRequestException("Add at least one ordered section before publishing");
      }
      return tx.essayVersion.update({
        where: { id },
        data: { status: ContentStatus.PUBLISHED },
      });
    });
  }

  async createSection(versionId: string, value: unknown, actorId: string) {
    const data = parseInput(sectionSchema, value);
    return this.audited("essay-section", "CREATED", actorId, async (tx) => {
      const version = await tx.essayVersion.findUnique({
        where: { id: versionId },
        select: { id: true, status: true },
      });
      if (!version) throw new NotFoundException("Essay version not found");
      if (version.status === ContentStatus.PUBLISHED) {
        await tx.essayVersion.update({
          where: { id: versionId },
          data: { status: ContentStatus.REVIEW },
        });
      }
      return tx.essaySection.create({ data: { versionId, ...data } });
    });
  }

  async updateSection(id: string, value: unknown, actorId: string) {
    const data = parseInput(sectionSchema.partial(), value);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Provide at least one section field to update");
    }
    return this.audited("essay-section", "UPDATED", actorId, async (tx) => {
      const current = await tx.essaySection.findUnique({
        where: { id },
        include: { version: { select: { id: true, status: true } } },
      });
      if (!current) throw new NotFoundException("Essay section not found");
      if (current.version.status === ContentStatus.PUBLISHED) {
        await tx.essayVersion.update({
          where: { id: current.version.id },
          data: { status: ContentStatus.REVIEW },
        });
      }
      return tx.essaySection.update({ where: { id }, data });
    });
  }

  async createVocabulary(essayId: string, value: unknown, actorId: string) {
    const data = parseInput(vocabularySchema, value);
    return this.audited("essay-vocabulary", "CREATED", actorId, async (tx) => {
      const essay = await tx.essay.findUnique({
        where: { id: essayId },
        select: { id: true, status: true },
      });
      if (!essay) throw new NotFoundException("Essay not found");
      if (essay.status === ContentStatus.PUBLISHED) {
        await tx.essay.update({
          where: { id: essayId },
          data: { status: ContentStatus.REVIEW, publishedAt: null },
        });
      }
      return tx.essayVocabulary.create({ data: { essayId, ...data } });
    });
  }

  async updateVocabulary(id: string, value: unknown, actorId: string) {
    const data = parseInput(vocabularySchema.partial(), value);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Provide at least one vocabulary field to update");
    }
    return this.audited("essay-vocabulary", "UPDATED", actorId, async (tx) => {
      const current = await tx.essayVocabulary.findUnique({
        where: { id },
        include: { essay: { select: { id: true, status: true } } },
      });
      if (!current) throw new NotFoundException("Essay vocabulary entry not found");
      if (current.essay.status === ContentStatus.PUBLISHED) {
        await tx.essay.update({
          where: { id: current.essay.id },
          data: { status: ContentStatus.REVIEW, publishedAt: null },
        });
      }
      return tx.essayVocabulary.update({ where: { id }, data });
    });
  }

  async createGrammarNote(essayId: string, value: unknown, actorId: string) {
    const data = parseInput(grammarSchema, value);
    return this.audited("essay-grammar", "CREATED", actorId, async (tx) => {
      const essay = await tx.essay.findUnique({
        where: { id: essayId },
        select: { id: true, status: true },
      });
      if (!essay) throw new NotFoundException("Essay not found");
      if (essay.status === ContentStatus.PUBLISHED) {
        await tx.essay.update({
          where: { id: essayId },
          data: { status: ContentStatus.REVIEW, publishedAt: null },
        });
      }
      return tx.essayGrammarNote.create({ data: { essayId, ...data } });
    });
  }

  async updateGrammarNote(id: string, value: unknown, actorId: string) {
    const data = parseInput(grammarSchema.partial(), value);
    if (Object.keys(data).length === 0) {
      throw new BadRequestException("Provide at least one grammar field to update");
    }
    return this.audited("essay-grammar", "UPDATED", actorId, async (tx) => {
      const current = await tx.essayGrammarNote.findUnique({
        where: { id },
        include: { essay: { select: { id: true, status: true } } },
      });
      if (!current) throw new NotFoundException("Essay grammar note not found");
      if (current.essay.status === ContentStatus.PUBLISHED) {
        await tx.essay.update({
          where: { id: current.essay.id },
          data: { status: ContentStatus.REVIEW, publishedAt: null },
        });
      }
      return tx.essayGrammarNote.update({ where: { id }, data });
    });
  }

  private async audited<T>(
    resource: string,
    action: string,
    actorId: string,
    operation: (tx: Tx) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.db.$transaction(async (tx) => {
        const result = await operation(tx);
        const record = result as { id: string };
        await tx.contentAuditLog.create({
          data: {
            resource,
            resourceId: record.id,
            action,
            actorId,
            snapshot: auditSnapshot(result),
          },
        });
        return result;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException("This version label already exists for the essay");
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
}
