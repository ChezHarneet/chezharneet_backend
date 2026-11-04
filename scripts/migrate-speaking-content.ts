import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { ContentStatus, PrismaClient } from "@prisma/client";

const MIGRATION_ACTOR = "speaking-content-migration";
const LEGACY_VERSION_LABEL = "Legacy (manual review)";
const LEGACY_SECTION_TYPE = "LEGACY_CONTENT";

type MigrationResult = {
  essayId: string;
  title: string;
  status: "READY_TO_MIGRATE" | "MIGRATED" | "SKIPPED" | "FAILED";
  reason: string;
  sourceContentSha256: string | null;
  sourceContentLength: number;
  versionId?: string;
};

function parseArguments(args: string[]) {
  const options = { apply: false, outputDir: "audit/speaking-migration" };
  for (const arg of args) {
    if (arg === "--dry-run") continue;
    if (arg === "--apply") {
      options.apply = true;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      if (!options.outputDir) throw new Error("--output-dir requires a path");
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function contentHash(content: string) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function createBackup(databaseUrl: string) {
  if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
    throw new Error("DATABASE_URL must use a PostgreSQL connection URI");
  }
  const directory = resolve(process.cwd(), "backups", "speaking-content");
  mkdirSync(directory, { recursive: true });
  const file = resolve(directory, `speaking-before-migration-${timestamp()}.dump`);
  if (existsSync(file)) throw new Error("Refusing to overwrite an existing database backup");
  const backup = spawnSync(
    "pg_dump",
    ["--format=custom", "--no-owner", "--no-privileges", "--file", file],
    {
      encoding: "utf8",
      env: { ...process.env, PGDATABASE: databaseUrl },
    },
  );
  if (backup.error || backup.status !== 0 || !existsSync(file) || statSync(file).size === 0) {
    throw new Error(
      `Database backup failed${backup.status === null ? "" : ` (pg_dump exit ${backup.status})`}; no migration writes were attempted`,
    );
  }
  return file;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured");

  const prisma = new PrismaClient();
  const outputDir = resolve(process.cwd(), options.outputDir);
  mkdirSync(outputDir, { recursive: true });
  const runStamp = timestamp();
  const logPath = resolve(outputDir, `migration-${runStamp}.jsonl`);
  const reportPath = resolve(outputDir, `reconciliation-${runStamp}.json`);
  const manualReviewPath = resolve(outputDir, `manual-review-${runStamp}.json`);

  try {
    const essays = await prisma.essay.findMany({
      orderBy: [{ taskId: "asc" }, { sortOrder: "asc" }, { id: "asc" }],
      select: {
        id: true,
        title: true,
        content: true,
        versions: {
          orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
          select: { id: true, versionLabel: true, sections: { select: { id: true } } },
        },
      },
    });

    const results: MigrationResult[] = essays.map((essay) => {
      if (essay.content === null || essay.content.length === 0) {
        return {
          essayId: essay.id,
          title: essay.title,
          status: "SKIPPED",
          reason: "No legacy Essay.content to copy; no content was inferred.",
          sourceContentSha256: null,
          sourceContentLength: 0,
        };
      }

      const sourceContentSha256 = contentHash(essay.content);
      if (essay.versions.some((version) => version.versionLabel === LEGACY_VERSION_LABEL)) {
        return {
          essayId: essay.id,
          title: essay.title,
          status: "SKIPPED",
          reason: "The manual-review version label already exists; existing structured data was left unchanged.",
          sourceContentSha256,
          sourceContentLength: essay.content.length,
        };
      }
      if (essay.versions.length > 0) {
        return {
          essayId: essay.id,
          title: essay.title,
          status: "SKIPPED",
          reason: "Structured versions already exist; legacy content requires manual reconciliation to avoid duplication.",
          sourceContentSha256,
          sourceContentLength: essay.content.length,
        };
      }
      return {
        essayId: essay.id,
        title: essay.title,
        status: "READY_TO_MIGRATE",
        reason: "Copy the exact legacy content into one unclassified draft section; CLB/version boundaries are not inferred.",
        sourceContentSha256,
        sourceContentLength: essay.content.length,
      };
    });

    if (options.apply && results.some((result) => result.status === "READY_TO_MIGRATE")) {
      const backupPath = createBackup(databaseUrl);
      console.info(JSON.stringify({ event: "backup-created", path: backupPath }));

      for (const result of results) {
        if (result.status === "SKIPPED") appendFileSync(logPath, `${JSON.stringify(result)}\n`, "utf8");
      }

      for (const result of results) {
        if (result.status !== "READY_TO_MIGRATE") continue;
        const source = essays.find((essay) => essay.id === result.essayId);
        if (!source || source.content === null) {
          result.status = "FAILED";
          result.reason = "Source Essay.content disappeared after preflight; no version was created.";
          appendFileSync(logPath, `${JSON.stringify(result)}\n`, "utf8");
          continue;
        }
        let createdVersion: { id: string };
        try {
          createdVersion = await prisma.$transaction(async (tx) => {
            const current = await tx.essay.findUnique({
              where: { id: source.id },
              select: { id: true, content: true, versions: { select: { id: true, versionLabel: true } } },
            });
            if (!current || current.content !== source.content || current.versions.length > 0) {
              throw new Error("Source changed after preflight; manual review required.");
            }
            if (current.content === null) {
              throw new Error("Source content is null after preflight; manual review required.");
            }
            const exactLegacyContent = current.content;
            const version = await tx.essayVersion.create({
              data: {
                essayId: source.id,
                versionLabel: LEGACY_VERSION_LABEL,
                sortOrder: 0,
                status: ContentStatus.DRAFT,
                sections: {
                  create: {
                    sectionType: LEGACY_SECTION_TYPE,
                    heading: "Unclassified legacy content (manual review)",
                    content: exactLegacyContent,
                    sortOrder: 0,
                  },
                },
              },
            });
            await tx.contentAuditLog.create({
              data: {
                resource: "essay-version",
                resourceId: version.id,
                action: "MIGRATED_LEGACY_CONTENT",
                actorId: MIGRATION_ACTOR,
                snapshot: {
                  essayId: source.id,
                  versionId: version.id,
                  versionLabel: LEGACY_VERSION_LABEL,
                  sourceContentSha256: result.sourceContentSha256,
                  sourceContentLength: result.sourceContentLength,
                  classification: "NEEDS_MANUAL_REVIEW",
                },
              },
            });
            return version;
          });
        } catch (cause) {
          result.status = "FAILED";
          result.reason = cause instanceof Error ? cause.message : "Unexpected migration error.";
          appendFileSync(logPath, `${JSON.stringify(result)}\n`, "utf8");
          console.error(JSON.stringify({ event: "record-failed", essayId: result.essayId, reason: result.reason }));
          continue;
        }
        result.status = "MIGRATED";
        result.versionId = createdVersion.id;
        result.reason = "Exact legacy text copied; original Essay.content and all legacy fields were retained.";
        appendFileSync(logPath, `${JSON.stringify(result)}\n`, "utf8");
        console.info(JSON.stringify({ event: "record-migrated", essayId: result.essayId, versionId: createdVersion.id }));
      }
    } else {
      for (const result of results) {
        appendFileSync(logPath, `${JSON.stringify(result)}\n`, "utf8");
      }
    }

    const report = {
      mode: options.apply ? "apply" : "dry-run",
      completedAt: new Date().toISOString(),
      totals: {
        essays: essays.length,
        ready: results.filter((result) => result.status === "READY_TO_MIGRATE").length,
        migrated: results.filter((result) => result.status === "MIGRATED").length,
        skipped: results.filter((result) => result.status === "SKIPPED").length,
        failed: results.filter((result) => result.status === "FAILED").length,
      },
      records: results,
    };
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
    writeFileSync(
      manualReviewPath,
      `${JSON.stringify(
        results.map(({ essayId, title, status, reason, sourceContentSha256, sourceContentLength, versionId }) => ({
          essayId,
          title,
          status: status === "MIGRATED" || status === "READY_TO_MIGRATE" ? "NEEDS_MANUAL_REVIEW" : status,
          reason,
          sourceContentSha256,
          sourceContentLength,
          versionId: versionId ?? null,
        })),
        null,
        2,
      )}\n`,
      { flag: "wx" },
    );
    console.info(JSON.stringify({ event: "complete", reportPath, manualReviewPath, logPath, totals: report.totals }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((cause: unknown) => {
  const message = cause instanceof Error
    ? cause.message.replace(/postgres(?:ql)?:\/\/\S+/gi, "[redacted PostgreSQL URL]")
    : "Unknown migration failure";
  console.error(`Speaking content migration stopped: ${message}`);
  process.exitCode = 1;
});
