-- CreateIndex
CREATE INDEX "AdminAction_adminUserId_idx" ON "AdminAction"("adminUserId");

-- CreateIndex
CREATE INDEX "AdminAction_targetUserId_actionType_idx" ON "AdminAction"("targetUserId", "actionType");

-- CreateIndex
CREATE INDEX "Enrollment_userId_idx" ON "Enrollment"("userId");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_idx" ON "Enrollment"("userId", "status");

-- CreateIndex
CREATE INDEX "Enrollment_domain_idx" ON "Enrollment"("domain");

-- CreateIndex
CREATE INDEX "Enrollment_domain_status_idx" ON "Enrollment"("domain", "status");

-- CreateIndex
CREATE INDEX "Enrollment_startedAt_idx" ON "Enrollment"("startedAt");

-- CreateIndex
CREATE INDEX "Enrollment_status_idx" ON "Enrollment"("status");

-- CreateIndex
CREATE INDEX "Referral_referredId_idx" ON "Referral"("referredId");

-- CreateIndex
CREATE INDEX "StudentProfile_domain_idx" ON "StudentProfile"("domain");

-- CreateIndex
CREATE INDEX "StudentProfile_userType_idx" ON "StudentProfile"("userType");

-- CreateIndex
CREATE INDEX "StudentProfile_referralCode_idx" ON "StudentProfile"("referralCode");

-- CreateIndex
CREATE INDEX "Submission_enrollmentId_dayNumber_idx" ON "Submission"("enrollmentId", "dayNumber");

-- CreateIndex
CREATE INDEX "Submission_submittedAt_idx" ON "Submission"("submittedAt");

-- CreateIndex
CREATE INDEX "Submission_status_idx" ON "Submission"("status");

-- CreateIndex
CREATE INDEX "Submission_enrollmentId_status_idx" ON "Submission"("enrollmentId", "status");

-- CreateIndex
CREATE INDEX "User_createdAt_idx" ON "User"("createdAt");
