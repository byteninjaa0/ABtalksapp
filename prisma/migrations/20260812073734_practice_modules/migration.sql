-- CreateEnum
CREATE TYPE "PracticeDifficulty" AS ENUM ('EASY', 'MEDIUM', 'HARD');

-- CreateEnum
CREATE TYPE "PracticeAttemptStatus" AS ENUM ('ACCEPTED', 'WRONG_ANSWER', 'RUNTIME_ERROR');

-- CreateTable
CREATE TABLE "PracticeTrack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeTopic" (
    "id" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,

    CONSTRAINT "PracticeTopic_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeProblem" (
    "id" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "inputFormat" TEXT NOT NULL,
    "outputFormat" TEXT NOT NULL,
    "constraintsMd" TEXT NOT NULL,
    "starterCode" TEXT NOT NULL,
    "difficulty" "PracticeDifficulty" NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeProblem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeTestCase" (
    "id" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "isSample" BOOLEAN NOT NULL DEFAULT false,
    "input" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "PracticeTestCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeAttempt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "status" "PracticeAttemptStatus" NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'python',
    "sourceCode" TEXT NOT NULL,
    "testsPassed" INTEGER NOT NULL,
    "testsTotal" INTEGER NOT NULL,
    "runtimeMs" INTEGER,
    "flagged" BOOLEAN NOT NULL DEFAULT false,
    "flagReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PracticeSolve" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "problemId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "synergyAwarded" INTEGER NOT NULL DEFAULT 0,
    "solvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PracticeSolve_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PracticeTrack_slug_key" ON "PracticeTrack"("slug");

-- CreateIndex
CREATE INDEX "PracticeTopic_trackId_sortOrder_idx" ON "PracticeTopic"("trackId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeTopic_trackId_slug_key" ON "PracticeTopic"("trackId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeProblem_slug_key" ON "PracticeProblem"("slug");

-- CreateIndex
CREATE INDEX "PracticeProblem_topicId_sortOrder_idx" ON "PracticeProblem"("topicId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeTestCase_problemId_ordinal_key" ON "PracticeTestCase"("problemId", "ordinal");

-- CreateIndex
CREATE INDEX "PracticeAttempt_userId_createdAt_idx" ON "PracticeAttempt"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PracticeAttempt_problemId_idx" ON "PracticeAttempt"("problemId");

-- CreateIndex
CREATE INDEX "PracticeAttempt_flagged_createdAt_idx" ON "PracticeAttempt"("flagged", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSolve_attemptId_key" ON "PracticeSolve"("attemptId");

-- CreateIndex
CREATE INDEX "PracticeSolve_userId_solvedAt_idx" ON "PracticeSolve"("userId", "solvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeSolve_userId_problemId_key" ON "PracticeSolve"("userId", "problemId");

-- AddForeignKey
ALTER TABLE "PracticeTopic" ADD CONSTRAINT "PracticeTopic_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "PracticeTrack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeProblem" ADD CONSTRAINT "PracticeProblem_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "PracticeTopic"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeTestCase" ADD CONSTRAINT "PracticeTestCase_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "PracticeProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeAttempt" ADD CONSTRAINT "PracticeAttempt_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "PracticeProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSolve" ADD CONSTRAINT "PracticeSolve_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSolve" ADD CONSTRAINT "PracticeSolve_problemId_fkey" FOREIGN KEY ("problemId") REFERENCES "PracticeProblem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PracticeSolve" ADD CONSTRAINT "PracticeSolve_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "PracticeAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;
