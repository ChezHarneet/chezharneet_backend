-- Add ordered, versioned Task 3 content without changing existing Essay rows.
-- Existing Essay IDs, content, status, ordering, and media relations are retained.

CREATE TABLE IF NOT EXISTS "EssayVersion" (
  "id" TEXT NOT NULL,
  "essayId" TEXT NOT NULL,
  "versionLabel" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EssayVersion_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EssayVersion_essayId_fkey"
    FOREIGN KEY ("essayId") REFERENCES "Essay"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "EssayVersion_essayId_versionLabel_key"
  ON "EssayVersion"("essayId", "versionLabel");
CREATE INDEX IF NOT EXISTS "EssayVersion_essayId_status_sortOrder_idx"
  ON "EssayVersion"("essayId", "status", "sortOrder");

CREATE TABLE IF NOT EXISTS "EssaySection" (
  "id" TEXT NOT NULL,
  "versionId" TEXT NOT NULL,
  "sectionType" TEXT NOT NULL,
  "heading" TEXT,
  "content" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EssaySection_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EssaySection_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "EssayVersion"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EssaySection_versionId_sortOrder_idx"
  ON "EssaySection"("versionId", "sortOrder");

CREATE TABLE IF NOT EXISTS "EssayVocabulary" (
  "id" TEXT NOT NULL,
  "essayId" TEXT NOT NULL,
  "frenchTerm" TEXT NOT NULL,
  "englishMeaning" TEXT,
  "example" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EssayVocabulary_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EssayVocabulary_essayId_fkey"
    FOREIGN KEY ("essayId") REFERENCES "Essay"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EssayVocabulary_essayId_sortOrder_idx"
  ON "EssayVocabulary"("essayId", "sortOrder");

CREATE TABLE IF NOT EXISTS "EssayGrammarNote" (
  "id" TEXT NOT NULL,
  "essayId" TEXT NOT NULL,
  "structure" TEXT NOT NULL,
  "example" TEXT,
  "purpose" TEXT,
  "explanation" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "EssayGrammarNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EssayGrammarNote_essayId_fkey"
    FOREIGN KEY ("essayId") REFERENCES "Essay"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "EssayGrammarNote_essayId_sortOrder_idx"
  ON "EssayGrammarNote"("essayId", "sortOrder");
