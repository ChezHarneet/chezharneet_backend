-- Add import metadata without changing existing Essay content or relationships.
ALTER TABLE "Essay"
  ADD COLUMN IF NOT EXISTS "category" TEXT,
  ADD COLUMN IF NOT EXISTS "sourceFingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Essay_sourceFingerprint_key"
  ON "Essay"("sourceFingerprint");
