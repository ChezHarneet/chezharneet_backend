-- Preserve existing access while moving to the canonical USER/ADMIN/SUPER_ADMIN roles.
-- STUDENT remains a normal user; existing editors retain their CMS access as ADMIN.
CREATE TYPE "Role_new" AS ENUM ('USER', 'ADMIN', 'SUPER_ADMIN');
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User"
  ALTER COLUMN "role" TYPE "Role_new"
  USING (
    CASE "role"::text
      WHEN 'STUDENT' THEN 'USER'
      WHEN 'EDITOR' THEN 'ADMIN'
      WHEN 'ADMIN' THEN 'ADMIN'
      ELSE 'USER'
    END
  )::"Role_new";
DROP TYPE "Role";
ALTER TYPE "Role_new" RENAME TO "Role";
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';
