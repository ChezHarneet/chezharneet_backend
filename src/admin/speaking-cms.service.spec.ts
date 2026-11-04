import assert from "node:assert/strict";
import test from "node:test";
import { SpeakingCmsService } from "./speaking-cms.service";

test("creating a speaking version preserves its label and writes an audit snapshot in the transaction", async () => {
  let versionInput: unknown;
  let auditInput: unknown;
  const tx = {
    essay: { findUnique: async () => ({ id: "essay-1" }) },
    essayVersion: {
      create: async ({ data }: { data: unknown }) => {
        versionInput = data;
        return { id: "version-1", ...data as object };
      },
    },
    contentAuditLog: {
      create: async ({ data }: { data: unknown }) => { auditInput = data; },
    },
  };
  const db = { $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx) };
  const service = new SpeakingCmsService(db as never);

  const result = await service.createVersion("essay-1", { versionLabel: "CLB 5–6", sortOrder: 2 }, "admin-1");

  assert.deepEqual(versionInput, { essayId: "essay-1", versionLabel: "CLB 5–6", sortOrder: 2 });
  assert.equal((result as { id: string }).id, "version-1");
  assert.deepEqual(auditInput, {
    resource: "essay-version",
    resourceId: "version-1",
    action: "CREATED",
    actorId: "admin-1",
    snapshot: { id: "version-1", essayId: "essay-1", versionLabel: "CLB 5–6", sortOrder: 2 },
  });
});

test("adding a section preserves French text and its requested order", async () => {
  const content = "À mon avis, il est important de réduire les déchets.";
  let sectionInput: unknown;
  const tx = {
    essayVersion: { findUnique: async () => ({ id: "version-1", status: "DRAFT" }) },
    essaySection: {
      create: async ({ data }: { data: unknown }) => {
        sectionInput = data;
        return { id: "section-1", ...data as object };
      },
    },
    contentAuditLog: { create: async () => undefined },
  };
  const db = { $transaction: async (operation: (value: typeof tx) => Promise<unknown>) => operation(tx) };
  const service = new SpeakingCmsService(db as never);

  await service.createSection("version-1", {
    sectionType: "ARGUMENT",
    heading: "Argument 2",
    content,
    sortOrder: 3,
  }, "admin-1");

  assert.deepEqual(sectionInput, {
    versionId: "version-1",
    sectionType: "ARGUMENT",
    heading: "Argument 2",
    content,
    sortOrder: 3,
  });
});

test("invalid section input is rejected before the database transaction", async () => {
  let transactionStarted = false;
  const db = {
    $transaction: async () => {
      transactionStarted = true;
      throw new Error("transaction should not be reached");
    },
  };
  const service = new SpeakingCmsService(db as never);

  await assert.rejects(
    service.createSection("version-1", { sectionType: "", content: "Contenu", unexpected: true }, "admin-1"),
    /sectionType/,
  );
  assert.equal(transactionStarted, false);
});

test("Task 3 PDF imports create separate draft essays and skip an existing fingerprint", async () => {
  const essays = new Map<string, { id: string; data: Record<string, unknown> }>();
  const auditRecords: unknown[] = [];
  let nextId = 1;
  const task = {
    id: "task-3",
    type: "TASK3",
    status: "PUBLISHED",
    module: { skill: "SPEAKING", status: "PUBLISHED", course: { status: "PUBLISHED" } },
  };
  const db = {
    task: { findUnique: async () => task },
    essay: {
      findUnique: async ({ where }: { where: { sourceFingerprint: string } }) => {
        const existing = essays.get(where.sourceFingerprint);
        return existing ? { id: existing.id } : null;
      },
    },
    $transaction: async (operation: (tx: {
      essay: {
        count: () => Promise<number>;
        create: (args: { data: Record<string, unknown> }) => Promise<{ id: string; status: unknown }>;
      };
      contentAuditLog: { create: (args: { data: unknown }) => Promise<void> };
    }) => Promise<unknown>) => operation({
      essay: {
        count: async () => essays.size,
        create: async ({ data }) => {
          const id = `essay-${nextId++}`;
          essays.set(data.sourceFingerprint as string, { id, data });
          return { id, status: data.status };
        },
      },
      contentAuditLog: { create: async ({ data }) => { auditRecords.push(data); } },
    }),
  };
  const service = new SpeakingCmsService(db as never);
  const topics = [
    {
      title: "Réduire les déchets",
      category: "Société",
      sourceText: "Sujet 1\nÀ mon avis, il faut protéger l’environnement.",
      sections: [{
        sectionType: "CLB_7",
        heading: "CLB 7",
        content: "À mon avis, il faut protéger l’environnement.",
        sortOrder: 0,
      }],
    },
    {
      title: "Les transports",
      category: "",
      sourceText: "Sujet 2\nLes transports en commun sont essentiels.",
      sections: [{
        sectionType: "CLB_5_6",
        heading: "CLB 5-6",
        content: "Les transports en commun sont essentiels.",
        sortOrder: 0,
      }],
    },
  ];

  const firstImport = await service.importTask3Topics("task-3", { topics }, "admin-1");

  assert.deepEqual(firstImport, {
    total: 2,
    successful: 2,
    failed: 0,
    skipped: 0,
    published: 0,
    results: [
      { title: "Réduire les déchets", status: "SUCCESS", essayId: "essay-1" },
      { title: "Les transports", status: "SUCCESS", essayId: "essay-2" },
    ],
  });
  assert.equal(essays.size, 2);
  assert.equal(auditRecords.length, 2);
  assert.deepEqual(
    [...essays.values()].map(({ data }) => data.content),
    topics.map((topic) => topic.sourceText),
  );
  assert.deepEqual(
    [...essays.values()].map(({ data }) => data.status),
    ["DRAFT", "DRAFT"],
  );
  assert.deepEqual(
    [...essays.values()].map(({ data }) => data.sortOrder),
    [0, 1],
  );
  assert.deepEqual(
    [...essays.values()].map(({ data }) =>
      (data.versions as { create: Array<{ versionLabel: string; sections: { create: unknown[] } }> }).create[0].versionLabel,
    ),
    ["CLB 7", "CLB 5-6"],
  );

  const duplicateImport = await service.importTask3Topics("task-3", { topics: [topics[0]] }, "admin-1");
  assert.equal(duplicateImport.successful, 0);
  assert.equal(duplicateImport.skipped, 1);
  assert.equal(duplicateImport.results[0].essayId, "essay-1");
  assert.equal(essays.size, 2);

  const publishImport = await service.importTask3Topics("task-3", {
    publishDetectedVersions: true,
    topics: [
      {
        title: "Sujet vérifié",
        category: "",
        sourceText: "Sujet vérifié\nRéponse complète.",
        sections: [
          { sectionType: "UNCLASSIFIED", heading: "Sujet", content: "Sujet vérifié", sortOrder: 0 },
          { sectionType: "CLB_7", heading: "CLB 7", content: "Réponse complète.", sortOrder: 1 },
          { sectionType: "VOCABULARY", heading: "Vocabulaire", content: "un mot — a word", sortOrder: 2 },
        ],
      },
      {
        title: "Sujet à vérifier",
        category: "",
        sourceText: "Sujet à vérifier\nContenu à classifier.",
        sections: [
          { sectionType: "CLB_7", heading: "CLB 7", content: "Réponse.", sortOrder: 0 },
          { sectionType: "UNCLASSIFIED", heading: "À vérifier", content: "Contenu à classifier.", sortOrder: 1 },
        ],
      },
    ],
  }, "admin-1");

  assert.equal(publishImport.successful, 2);
  assert.equal(publishImport.published, 1);
  const publishable = [...essays.values()].find(({ data }) => data.title === "Sujet vérifié");
  const needsReview = [...essays.values()].find(({ data }) => data.title === "Sujet à vérifier");
  assert.equal(publishable?.data.status, "PUBLISHED");
  assert.equal(publishable?.data.prompt, "Sujet vérifié");
  assert.deepEqual(
    (publishable?.data.versions as { create: Array<{ status: string }> }).create.map(({ status }) => status),
    ["DRAFT", "PUBLISHED", "PUBLISHED"],
  );
  assert.equal(needsReview?.data.status, "DRAFT");
  assert.deepEqual(
    (needsReview?.data.versions as { create: Array<{ status: string }> }).create.map(({ status }) => status),
    ["DRAFT", "DRAFT"],
  );

  task.status = "DRAFT";
  const parentDraftImport = await service.importTask3Topics("task-3", {
    publishDetectedVersions: true,
    topics: [{
      title: "Sujet avec parent en brouillon",
      category: "",
      sourceText: "Sujet avec parent en brouillon\nRéponse complète.",
      sections: [{
        sectionType: "CLB_7",
        heading: "CLB 7",
        content: "Réponse complète.",
        sortOrder: 0,
      }],
    }],
  }, "admin-1");
  assert.equal(parentDraftImport.published, 0);
  assert.equal(parentDraftImport.results[0].published, false);
});
