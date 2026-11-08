CREATE INDEX "Session_refreshTokenHash_revokedAt_expiresAt_idx"
  ON "Session"("refreshTokenHash", "revokedAt", "expiresAt");

CREATE TABLE "AdminInvite" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "firstName" TEXT NOT NULL,
  "lastName" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "invitedById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AdminInvite_invitedById_fkey"
    FOREIGN KEY ("invitedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AdminInvite_tokenHash_key" ON "AdminInvite"("tokenHash");
CREATE INDEX "AdminInvite_email_acceptedAt_expiresAt_idx"
  ON "AdminInvite"("email", "acceptedAt", "expiresAt");
CREATE INDEX "AdminInvite_invitedById_createdAt_idx"
  ON "AdminInvite"("invitedById", "createdAt");
