import "reflect-metadata";
import { CourseSkill, Role, TaskType } from "@prisma/client";
import { PrismaService } from "../src/common/prisma.service";
import { SpeakingCmsService } from "../src/admin/speaking-cms.service";
import { parseSpeakingTopics } from "../src/admin/speaking-pdf.parser";

const BATCH_SIZE = 10;

function documentId(url: string) {
  const id = new URL(url).pathname.match(/\/document\/d\/([^/]+)/)?.[1];
  if (!id) {
    throw new Error(`Not a Google Docs document URL: ${url}`);
  }
  return id;
}

async function readDocument(url: string) {
  const id = documentId(url);
  const response = await fetch(
    `https://docs.google.com/document/d/${id}/export?format=txt`,
  );
  if (!response.ok) {
    throw new Error(`Google Docs export failed with HTTP ${response.status}`);
  }
  return (await response.text()).replace(/^\uFEFF/, "");
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args[0] === "--dry-run";
  const urls = dryRun ? args.slice(1) : args;
  if (urls.length === 0) {
    throw new Error(
      "Provide one or more Google Docs URLs. Add --dry-run to inspect without importing.",
    );
  }

  const importedDocuments = await Promise.all(
    urls.map(async (url) => {
      const sourceText = await readDocument(url);
      const parsed = parseSpeakingTopics(sourceText);
      const coveredCharacters = parsed.topics.reduce(
        (total, topic) => total + topic.sourceText.length,
        0,
      );
      if (
        parsed.topics.length === 0 ||
        coveredCharacters !== sourceText.length ||
        parsed.topics.some(
          (topic) =>
            !topic.title.trim() ||
            !topic.sections.some(
              (section) =>
                section.sectionType === "CLB_7" && section.content.trim(),
            ),
        )
      ) {
        throw new Error(
          `Document ${documentId(url)} did not parse into complete topics with CLB 7 content; nothing was imported.`,
        );
      }

      return { id: documentId(url), topics: parsed.topics };
    }),
  );

  const totalTopics = importedDocuments.reduce(
    (total, document) => total + document.topics.length,
    0,
  );
  console.log(
    `${dryRun ? "Dry run: " : ""}parsed ${totalTopics} topics from ${importedDocuments.length} documents.`,
  );
  for (const document of importedDocuments) {
    console.log(
      `${document.id}: ${document.topics.length} topics; ${document.topics.map((topic) => topic.title).join(" | ")}`,
    );
  }
  if (dryRun) return;

  const db = new PrismaService();
  try {
    const task = await db.task.findFirst({
      where: {
        type: TaskType.TASK3,
        module: {
          skill: CourseSkill.SPEAKING,
          course: { slug: "french-exam" },
        },
      },
      select: { id: true },
    });
    if (!task) {
      throw new Error("The French Exam Speaking Task 3 was not found.");
    }

    const actor = await db.user.findFirst({
      where: { isActive: true, role: Role.ADMIN },
      orderBy: { createdAt: "asc" },
      select: { id: true },
    });
    if (!actor) {
      throw new Error("No active admin account is available for import auditing.");
    }

    const service = new SpeakingCmsService(db);
    let successful = 0;
    let skipped = 0;
    let failed = 0;
    let published = 0;

    for (const document of importedDocuments) {
      for (let index = 0; index < document.topics.length; index += BATCH_SIZE) {
        const topics = document.topics.slice(index, index + BATCH_SIZE);
        const result = await service.importTask3Topics(
          task.id,
          {
            publishDetectedVersions: true,
            topics: topics.map((topic) => ({
              title: topic.title,
              category: topic.category,
              sourceText: topic.sourceText,
              sections: topic.sections,
            })),
          },
          actor.id,
        );
        successful += result.successful;
        skipped += result.skipped;
        failed += result.failed;
        published += result.published;
        for (const item of result.results) {
          console.log(`${item.status}: ${item.title}${item.reason ? ` — ${item.reason}` : ""}`);
        }
      }
    }

    console.log(
      `Import complete: ${successful} imported, ${skipped} already present, ${failed} failed, ${published} published.`,
    );
    if (failed > 0) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
