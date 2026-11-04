import { Type } from "class-transformer";
import { BadRequestException } from "@nestjs/common";
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import {
  ContentStatus,
  CourseSkill,
  PracticeMode,
  TaskFormat,
  TaskType,
} from "@prisma/client";
import { z } from "zod";

export const cmsResources = [
  "courses",
  "modules",
  "tasks",
  "themes",
  "topics",
  "practice-sets",
  "practice-questions",
  "essays",
  "vocabulary",
  "grammar",
  "exam-criteria",
] as const;

export type CmsResource = (typeof cmsResources)[number];

export function parseCmsResource(value: string): CmsResource {
  if ((cmsResources as readonly string[]).includes(value)) {
    return value as CmsResource;
  }
  throw new BadRequestException("Unsupported CMS content type");
}

const optionalText = z.string().trim().max(12000).nullable().optional();
const requiredText = z.string().trim().min(1).max(300);
const slug = z
  .string()
  .trim()
  .min(1)
  .max(180)
  .regex(/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u, "Use a URL-safe slug");
const optionalInt = z.number().int().min(0).max(100000).nullable().optional();
const contentStatus = z.nativeEnum(ContentStatus);

const cmsSchemas = {
  courses: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      slug,
      title: requiredText,
      description: optionalText,
      status: contentStatus.optional(),
      priceMinor: z.number().int().min(0).max(100000000).optional(),
      currency: z.string().trim().length(3).optional(),
      isFree: z.boolean().optional(),
    })
    .strict(),
  modules: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      courseId: requiredText,
      slug,
      title: requiredText,
      description: optionalText,
      skill: z.nativeEnum(CourseSkill),
      examLabel: optionalText,
      durationMinutes: optionalInt,
      questionCount: optionalInt,
      sortOrder: z.number().int().min(0).max(100000).optional(),
      status: contentStatus.optional(),
    })
    .strict(),
  tasks: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      moduleId: requiredText,
      type: z.nativeEnum(TaskType),
      format: z.nativeEnum(TaskFormat),
      title: requiredText,
      description: optionalText,
      instructions: optionalText,
      durationMinutes: optionalInt,
      questionCount: optionalInt,
      sortOrder: z.number().int().min(0).max(100000).optional(),
      status: contentStatus.optional(),
    })
    .strict(),
  themes: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      moduleId: requiredText,
      taskId: z.string().trim().min(1).nullable().optional(),
      slug,
      name: requiredText,
      description: optionalText,
      sortOrder: z.number().int().min(0).max(100000).optional(),
      status: contentStatus.optional(),
    })
    .strict(),
  topics: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      themeId: requiredText,
      slug,
      title: requiredText,
      situation: optionalText,
      question: optionalText,
      modelAnswer: optionalText,
      extraInformation: optionalText,
      conclusion: optionalText,
      status: contentStatus.optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  "practice-sets": z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      moduleId: requiredText,
      taskId: z.string().trim().min(1).nullable().optional(),
      slug,
      title: requiredText,
      description: optionalText,
      mode: z.nativeEnum(PracticeMode).optional(),
      durationMinutes: optionalInt,
      questionCount: optionalInt,
      status: contentStatus.optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  "practice-questions": z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      practiceSetId: requiredText,
      prompt: requiredText,
      options: z.unknown().nullable().optional(),
      answer: optionalText,
      explanation: optionalText,
      audioMediaId: z.string().trim().min(1).nullable().optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  essays: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      taskId: requiredText,
      slug,
      title: requiredText,
      prompt: optionalText,
      content: optionalText,
      summary: optionalText,
      extraInformation: optionalText,
      status: contentStatus.optional(),
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  vocabulary: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      topicId: requiredText,
      term: requiredText,
      meaning: optionalText,
      example: optionalText,
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  grammar: z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      topicId: requiredText,
      rule: requiredText,
      explanation: optionalText,
      example: optionalText,
      sortOrder: z.number().int().min(0).max(100000).optional(),
    })
    .strict(),
  "exam-criteria": z
    .object({
      id: z.string().trim().min(1).max(100).optional(),
      topicId: requiredText,
      lexicalResources: optionalText,
      grammar: optionalText,
      coherence: optionalText,
      taskFulfillment: optionalText,
      relevance: optionalText,
    })
    .strict(),
};

export function parseCmsInput(
  resource: CmsResource,
  input: unknown,
  partial = false,
): Record<string, unknown> {
  const schema = cmsSchemas[resource];
  const validator = partial ? schema.partial() : schema;
  const parsed = validator.safeParse(input);
  if (!parsed.success) {
    throw new BadRequestException(
      parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "record"}: ${issue.message}`)
        .join("; "),
    );
  }
  return parsed.data as Record<string, unknown>;
}

export class CmsListQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsEnum(ContentStatus)
  status?: ContentStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000000)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class CmsPayloadDto {
  @IsOptional() @IsString() @MaxLength(300) courseId?: string;
  @IsOptional() @IsString() @MaxLength(300) moduleId?: string;
  @IsOptional() @IsString() @MaxLength(300) taskId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) themeId?: string;
  @IsOptional() @IsString() @MaxLength(300) topicId?: string;
  @IsOptional() @IsString() @MaxLength(300) practiceSetId?: string;
  @IsOptional() @IsString() @MaxLength(300) slug?: string;
  @IsOptional() @IsString() @MaxLength(300) title?: string;
  @IsOptional() @IsString() @MaxLength(300) name?: string;
  @IsOptional() @IsString() @MaxLength(300) term?: string;
  @IsOptional() @IsString() @MaxLength(300) rule?: string;
  @IsOptional() @IsString() @MaxLength(12000) prompt?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) description?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) instructions?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) examLabel?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) situation?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) question?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) modelAnswer?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) extraInformation?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) conclusion?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) content?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) summary?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) meaning?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) example?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) explanation?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) lexicalResources?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) coherence?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) taskFulfillment?: string | null;
  @IsOptional() @IsString() @MaxLength(12000) relevance?: string | null;
  @IsOptional() @IsString() @MaxLength(300) audioMediaId?: string | null;
  @IsOptional() @IsEnum(ContentStatus) status?: ContentStatus;
  @IsOptional() @IsEnum(CourseSkill) skill?: CourseSkill;
  @IsOptional() @IsEnum(TaskType) type?: TaskType;
  @IsOptional() @IsEnum(TaskFormat) format?: TaskFormat;
  @IsOptional() @IsEnum(PracticeMode) mode?: PracticeMode;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  durationMinutes?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  questionCount?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000)
  sortOrder?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100000000)
  priceMinor?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsBoolean() isFree?: boolean;
  @IsOptional() options?: unknown;
  @IsOptional() @IsString() @MaxLength(300) grammar?: string | null;
}

export class CmsImportDto {
  @IsIn(cmsResources)
  resource!: CmsResource;

  @IsArray()
  @ArrayMaxSize(500)
  @IsObject({ each: true })
  records!: Record<string, unknown>[];
}

export class CmsExportQueryDto {
  @IsIn(cmsResources)
  resource!: CmsResource;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset = 0;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limit = 1000;
}
