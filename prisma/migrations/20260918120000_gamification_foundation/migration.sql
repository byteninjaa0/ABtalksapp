-- Plan 151 gamification foundation. Additive only.

CREATE TYPE "GamificationEventStatus" AS ENUM ('PENDING', 'PROCESSING', 'PROCESSED', 'SKIPPED', 'FAILED', 'DEAD');
CREATE TYPE "XpCategory" AS ENUM ('LEARNING', 'BUILDING', 'CAREER', 'COMPETITION', 'COMMUNITY');
CREATE TYPE "GamificationFlagSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "GamificationFlagStatus" AS ENUM ('OPEN', 'CLEARED', 'ACTIONED');
CREATE TYPE "QuestCadence" AS ENUM ('ONBOARDING', 'WEEKLY', 'MONTHLY', 'CAREER');
CREATE TYPE "UserQuestStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'EXPIRED');

CREATE TABLE "GamificationEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "status" "GamificationEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lockedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "isBackfill" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamificationEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GamificationEvent_idempotencyKey_key" ON "GamificationEvent"("idempotencyKey");
CREATE INDEX "GamificationEvent_status_createdAt_idx" ON "GamificationEvent"("status", "createdAt");
CREATE INDEX "GamificationEvent_userId_occurredAt_idx" ON "GamificationEvent"("userId", "occurredAt" DESC);
CREATE INDEX "GamificationEvent_type_occurredAt_idx" ON "GamificationEvent"("type", "occurredAt" DESC);
CREATE INDEX "GamificationEvent_sourceType_sourceId_idx" ON "GamificationEvent"("sourceType", "sourceId");

CREATE TABLE "XpTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "category" "XpCategory" NOT NULL,
    "ruleKey" TEXT NOT NULL,
    "eventId" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "reversesId" TEXT,
    "isBackfill" BOOLEAN NOT NULL DEFAULT false,
    "reason" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpTransaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XpTransaction_idempotencyKey_key" ON "XpTransaction"("idempotencyKey");
CREATE UNIQUE INDEX "XpTransaction_reversesId_key" ON "XpTransaction"("reversesId");
CREATE INDEX "XpTransaction_userId_createdAt_idx" ON "XpTransaction"("userId", "createdAt" DESC);
CREATE INDEX "XpTransaction_sourceType_sourceId_idx" ON "XpTransaction"("sourceType", "sourceId");
CREATE INDEX "XpTransaction_createdAt_idx" ON "XpTransaction"("createdAt" DESC);

CREATE TABLE "UserProgress" (
    "userId" TEXT NOT NULL,
    "xpTotal" INTEGER NOT NULL DEFAULT 0,
    "level" INTEGER NOT NULL DEFAULT 1,
    "levelReachedAt" TIMESTAMP(3),
    "weekStreak" INTEGER NOT NULL DEFAULT 0,
    "longestWeekStreak" INTEGER NOT NULL DEFAULT 0,
    "lastActiveWeekKey" TEXT,
    "streakFreezes" INTEGER NOT NULL DEFAULT 0,
    "heldAt" TIMESTAMP(3),
    "recomputedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProgress_pkey" PRIMARY KEY ("userId")
);

CREATE INDEX "UserProgress_level_idx" ON "UserProgress"("level");

CREATE TABLE "XpPeriodScore" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "xp" INTEGER NOT NULL DEFAULT 0,
    "lastXpAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "XpPeriodScore_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "XpPeriodScore_userId_periodType_periodKey_key" ON "XpPeriodScore"("userId", "periodType", "periodKey");
CREATE INDEX "XpPeriodScore_periodType_periodKey_xp_lastXpAt_idx" ON "XpPeriodScore"("periodType", "periodKey", "xp" DESC, "lastXpAt");

CREATE TABLE "BadgeDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "baseRarity" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "criteriaVersion" INTEGER NOT NULL DEFAULT 1,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "iconKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isHidden" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "earnedCount" INTEGER NOT NULL DEFAULT 0,
    "measuredRarity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BadgeDefinition_slug_key" ON "BadgeDefinition"("slug");

CREATE TABLE "UserBadge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "badgeId" TEXT NOT NULL,
    "criteriaVersion" INTEGER NOT NULL,
    "earnedAt" TIMESTAMP(3) NOT NULL,
    "sourceEventId" TEXT,
    "evidence" JSONB,
    "seenAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,

    CONSTRAINT "UserBadge_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBadge_userId_badgeId_key" ON "UserBadge"("userId", "badgeId");
CREATE INDEX "UserBadge_badgeId_earnedAt_idx" ON "UserBadge"("badgeId", "earnedAt");
CREATE INDEX "UserBadge_userId_earnedAt_idx" ON "UserBadge"("userId", "earnedAt" DESC);
CREATE INDEX "UserBadge_userId_seenAt_idx" ON "UserBadge"("userId", "seenAt");

CREATE TABLE "QuestDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cadence" "QuestCadence" NOT NULL,
    "segment" TEXT,
    "tasks" JSONB NOT NULL,
    "xpReward" INTEGER NOT NULL DEFAULT 0,
    "badgeSlug" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QuestDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "QuestDefinition_slug_key" ON "QuestDefinition"("slug");

CREATE TABLE "UserQuest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "questId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" "UserQuestStatus" NOT NULL DEFAULT 'ACTIVE',
    "progress" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "UserQuest_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserQuest_userId_questId_periodKey_key" ON "UserQuest"("userId", "questId", "periodKey");
CREATE INDEX "UserQuest_userId_status_idx" ON "UserQuest"("userId", "status");

CREATE TABLE "GamificationRule" (
    "key" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "category" "XpCategory" NOT NULL,
    "xpAmount" INTEGER,
    "multiplierBp" INTEGER NOT NULL DEFAULT 10000,
    "dailyCap" INTEGER,
    "weeklyCap" INTEGER,
    "lifetimeCap" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "updatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GamificationRule_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "GamificationFlag" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "severity" "GamificationFlagSeverity" NOT NULL,
    "status" "GamificationFlagStatus" NOT NULL DEFAULT 'OPEN',
    "details" JSONB,
    "sourceEventId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GamificationFlag_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GamificationFlag_status_severity_createdAt_idx" ON "GamificationFlag"("status", "severity", "createdAt");
CREATE INDEX "GamificationFlag_userId_createdAt_idx" ON "GamificationFlag"("userId", "createdAt" DESC);

ALTER TABLE "GamificationEvent" ADD CONSTRAINT "GamificationEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpTransaction" ADD CONSTRAINT "XpTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserProgress" ADD CONSTRAINT "UserProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "XpPeriodScore" ADD CONSTRAINT "XpPeriodScore_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserBadge" ADD CONSTRAINT "UserBadge_badgeId_fkey" FOREIGN KEY ("badgeId") REFERENCES "BadgeDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserQuest" ADD CONSTRAINT "UserQuest_questId_fkey" FOREIGN KEY ("questId") REFERENCES "QuestDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GamificationFlag" ADD CONSTRAINT "GamificationFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
