-- T-250: candidate job alerts. Rule-based matching, one row per candidate.
-- The unique index on candidateUserId enforces one alert per candidate; the
-- fanout runs on the first DRAFT->PUBLISHED transition of a Job and dedupes
-- via UserNotification.dedupeKey, so this table stays small and simple.

-- CreateTable
CREATE TABLE "JobAlert" (
    "id" TEXT NOT NULL,
    "candidateUserId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "skills" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "role" TEXT,
    "location" TEXT,
    "workMode" "JobWorkMode",
    "opportunityType" "JobType",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobAlert_candidateUserId_key" ON "JobAlert"("candidateUserId");

-- CreateIndex
CREATE INDEX "JobAlert_enabled_idx" ON "JobAlert"("enabled");

-- AddForeignKey
ALTER TABLE "JobAlert" ADD CONSTRAINT "JobAlert_candidateUserId_fkey" FOREIGN KEY ("candidateUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
