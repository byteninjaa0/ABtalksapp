-- TalentRequest becomes a persistent project, and a match remembers itself.
--
-- Additive: every new column is nullable or defaulted, so no existing row stops
-- loading and nothing is dropped, renamed or retyped.
--
-- ONE PART CAN FAIL ON EXISTING DATA: the unique index at the bottom. Run the
-- duplicate check in the pre-flight note below on the TARGET database before
-- applying. Checked on the dev database (40 rows, 0 duplicate pairs); the
-- production database is a different Neon endpoint and must be checked
-- separately.
--
-- See docs/plans/113-A-schema-review-sohail.md for the design and the open
-- decisions this implements.

-- CreateEnum
CREATE TYPE "TalentMatchDecision" AS ENUM ('UNDECIDED', 'SHORTLISTED', 'REJECTED');

-- AlterTable
ALTER TABLE "TalentRequest" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "lastViewedAt" TIMESTAMP(3),
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "TalentRequestMatch" ADD COLUMN     "decision" "TalentMatchDecision" NOT NULL DEFAULT 'UNDECIDED',
ADD COLUMN     "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "viewedAt" TIMESTAMP(3);

-- Backfill: every existing request counts as "seen just now".
--
-- Without this every recruiter's first load after deploy flags EVERY candidate
-- as new, because firstSeenAt defaults to CURRENT_TIMESTAMP above and there is
-- no last-visit to compare it against. This is the highest-risk line in the
-- migration and it is why the backfill lives here rather than in a follow-up.
UPDATE "TalentRequest" SET "lastViewedAt" = CURRENT_TIMESTAMP WHERE "lastViewedAt" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "TalentRequestMatch_requestId_candidateUserId_key" ON "TalentRequestMatch"("requestId", "candidateUserId");
