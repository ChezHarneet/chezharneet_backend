CREATE TABLE "ContentAuditLog" (
  "id" TEXT NOT NULL,
  "resource" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "actorId" TEXT NOT NULL,
  "snapshot" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ContentAuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ContentAuditLog_resource_resourceId_createdAt_idx"
  ON "ContentAuditLog"("resource", "resourceId", "createdAt");
CREATE INDEX "ContentAuditLog_createdAt_idx"
  ON "ContentAuditLog"("createdAt");
CREATE INDEX "ContentAuditLog_actorId_createdAt_idx"
  ON "ContentAuditLog"("actorId", "createdAt");
