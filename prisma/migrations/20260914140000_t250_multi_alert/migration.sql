-- T-250 multi-alert: allow many rows per candidate, each with a name.
-- Existing rows get name = 'My job alert' via the column default. The
-- old unique index goes; a composite index on (candidateUserId, createdAt)
-- takes over for the candidate-scoped list read.

-- DropIndex
DROP INDEX IF EXISTS "JobAlert_candidateUserId_key";

-- AddColumn
ALTER TABLE "JobAlert" ADD COLUMN "name" TEXT NOT NULL DEFAULT 'My job alert';

-- CreateIndex
CREATE INDEX "JobAlert_candidateUserId_createdAt_idx" ON "JobAlert"("candidateUserId", "createdAt" DESC);
