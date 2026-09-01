-- Initial DivePlan schema.
-- Generated from prisma/schema.prisma. Run `npm run prisma:migrate` to apply in development.

CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'COACH', 'ATHLETE');
CREATE TYPE "WeekStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "SessionStatus" AS ENUM ('DRAFT', 'READY', 'COMPLETED');
CREATE TYPE "BlockType" AS ENUM ('WARMUP', 'DRYLAND', 'POOL', 'COOLDOWN', 'CUSTOM');
CREATE TYPE "PoolHeight" AS ENUM ('ONE_METER', 'THREE_METER', 'PLATFORM', 'CUSTOM');
CREATE TYPE "SkillStatus" AS ENUM ('NOT_STARTED', 'LEARNING', 'DEVELOPING', 'MASTERED');
CREATE TYPE "CompletionStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

CREATE TABLE "Club" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "logo" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Club_pkey" PRIMARY KEY ("id"));
CREATE TABLE "User" ("id" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "email" TEXT NOT NULL, "role" "UserRole" NOT NULL, "avatar" TEXT, "clubId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "User_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Athlete" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "clubId" TEXT NOT NULL, "groupId" TEXT, "birthDate" TIMESTAMP(3) NOT NULL, "level" TEXT NOT NULL, "active" BOOLEAN NOT NULL DEFAULT true, CONSTRAINT "Athlete_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Coach" ("id" TEXT NOT NULL, "userId" TEXT NOT NULL, "clubId" TEXT NOT NULL, CONSTRAINT "Coach_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TrainingGroup" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "clubId" TEXT NOT NULL, "coachId" TEXT NOT NULL, CONSTRAINT "TrainingGroup_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TrainingWeek" ("id" TEXT NOT NULL, "clubId" TEXT NOT NULL, "groupId" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "title" TEXT NOT NULL, "status" "WeekStatus" NOT NULL DEFAULT 'DRAFT', CONSTRAINT "TrainingWeek_pkey" PRIMARY KEY ("id"));
CREATE TABLE "TrainingSession" ("id" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "title" TEXT NOT NULL, "duration" INTEGER NOT NULL, "focus" TEXT NOT NULL, "notes" TEXT, "weekId" TEXT NOT NULL, "coachId" TEXT NOT NULL, "status" "SessionStatus" NOT NULL DEFAULT 'DRAFT', CONSTRAINT "TrainingSession_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SessionBlock" ("id" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "type" "BlockType" NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "duration" INTEGER NOT NULL, "position" INTEGER NOT NULL, "estimatedVolume" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "SessionBlock_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SessionBlockAssignment" ("id" TEXT NOT NULL, "sessionBlockId" TEXT NOT NULL, "athleteId" TEXT NOT NULL, CONSTRAINT "SessionBlockAssignment_pkey" PRIMARY KEY ("id"));
CREATE TABLE "DrylandExercise" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL, "description" TEXT NOT NULL, "videoUrl" TEXT, "defaultSets" INTEGER, "defaultReps" INTEGER, "defaultDuration" INTEGER, "equipment" TEXT, "tags" TEXT[], CONSTRAINT "DrylandExercise_pkey" PRIMARY KEY ("id"));
CREATE TABLE "DrylandBlockExercise" ("blockId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, "sets" INTEGER, "reps" INTEGER, "duration" INTEGER, "notes" TEXT, "order" INTEGER NOT NULL, CONSTRAINT "DrylandBlockExercise_pkey" PRIMARY KEY ("blockId","exerciseId"));
CREATE TABLE "PoolTraining" ("blockId" TEXT NOT NULL, CONSTRAINT "PoolTraining_pkey" PRIMARY KEY ("blockId"));
CREATE TABLE "PoolSection" ("id" TEXT NOT NULL, "poolTrainingId" TEXT NOT NULL, "height" "PoolHeight" NOT NULL, "label" TEXT, CONSTRAINT "PoolSection_pkey" PRIMARY KEY ("id"));
CREATE TABLE "PoolDive" ("id" TEXT NOT NULL, "poolSectionId" TEXT NOT NULL, "diveCode" TEXT NOT NULL, "diveName" TEXT NOT NULL, "position" TEXT NOT NULL, "repetitions" INTEGER NOT NULL, "notes" TEXT, "order" INTEGER NOT NULL, CONSTRAINT "PoolDive_pkey" PRIMARY KEY ("id"));
CREATE TABLE "SessionTemplate" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "category" TEXT NOT NULL, "sessionId" TEXT, "clubId" TEXT NOT NULL, "favorite" BOOLEAN NOT NULL DEFAULT false, "payload" JSONB NOT NULL, CONSTRAINT "SessionTemplate_pkey" PRIMARY KEY ("id"));
CREATE TABLE "Skill" ("id" TEXT NOT NULL, "name" TEXT NOT NULL, "code" TEXT NOT NULL, "category" TEXT NOT NULL, "height" TEXT NOT NULL, "prerequisites" TEXT[], CONSTRAINT "Skill_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AthleteSkill" ("athleteId" TEXT NOT NULL, "skillId" TEXT NOT NULL, "level" INTEGER NOT NULL, "progress" INTEGER NOT NULL, "status" "SkillStatus" NOT NULL, "trainings" INTEGER NOT NULL DEFAULT 0, "repetitions" INTEGER NOT NULL DEFAULT 0, CONSTRAINT "AthleteSkill_pkey" PRIMARY KEY ("athleteId","skillId"));
CREATE TABLE "AthleteSessionCompletion" ("athleteId" TEXT NOT NULL, "sessionId" TEXT NOT NULL, "startedAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "status" "CompletionStatus" NOT NULL DEFAULT 'NOT_STARTED', CONSTRAINT "AthleteSessionCompletion_pkey" PRIMARY KEY ("athleteId","sessionId"));
CREATE TABLE "AthleteDiveLog" ("id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "poolDiveId" TEXT NOT NULL, "repetitionsCompleted" INTEGER NOT NULL, "rating" TEXT NOT NULL, "note" TEXT, "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AthleteDiveLog_pkey" PRIMARY KEY ("id"));
CREATE TABLE "AthleteExerciseLog" ("id" TEXT NOT NULL, "athleteId" TEXT NOT NULL, "exerciseId" TEXT NOT NULL, "completed" BOOLEAN NOT NULL DEFAULT false, "rating" TEXT, "note" TEXT, CONSTRAINT "AthleteExerciseLog_pkey" PRIMARY KEY ("id"));

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Athlete_userId_key" ON "Athlete"("userId");
CREATE UNIQUE INDEX "Coach_userId_key" ON "Coach"("userId");
CREATE UNIQUE INDEX "SessionBlockAssignment_sessionBlockId_athleteId_key" ON "SessionBlockAssignment"("sessionBlockId", "athleteId");
CREATE UNIQUE INDEX "Skill_code_key" ON "Skill"("code");

ALTER TABLE "User" ADD CONSTRAINT "User_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Athlete" ADD CONSTRAINT "Athlete_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Coach" ADD CONSTRAINT "Coach_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingGroup" ADD CONSTRAINT "TrainingGroup_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingGroup" ADD CONSTRAINT "TrainingGroup_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingWeek" ADD CONSTRAINT "TrainingWeek_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingWeek" ADD CONSTRAINT "TrainingWeek_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "TrainingGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_weekId_fkey" FOREIGN KEY ("weekId") REFERENCES "TrainingWeek"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TrainingSession" ADD CONSTRAINT "TrainingSession_coachId_fkey" FOREIGN KEY ("coachId") REFERENCES "Coach"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionBlock" ADD CONSTRAINT "SessionBlock_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SessionBlockAssignment" ADD CONSTRAINT "SessionBlockAssignment_sessionBlockId_fkey" FOREIGN KEY ("sessionBlockId") REFERENCES "SessionBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionBlockAssignment" ADD CONSTRAINT "SessionBlockAssignment_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrylandBlockExercise" ADD CONSTRAINT "DrylandBlockExercise_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "SessionBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DrylandBlockExercise" ADD CONSTRAINT "DrylandBlockExercise_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "DrylandExercise"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PoolTraining" ADD CONSTRAINT "PoolTraining_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "SessionBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolSection" ADD CONSTRAINT "PoolSection_poolTrainingId_fkey" FOREIGN KEY ("poolTrainingId") REFERENCES "PoolTraining"("blockId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PoolDive" ADD CONSTRAINT "PoolDive_poolSectionId_fkey" FOREIGN KEY ("poolSectionId") REFERENCES "PoolSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SessionTemplate" ADD CONSTRAINT "SessionTemplate_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AthleteSkill" ADD CONSTRAINT "AthleteSkill_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteSkill" ADD CONSTRAINT "AthleteSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteSessionCompletion" ADD CONSTRAINT "AthleteSessionCompletion_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteSessionCompletion" ADD CONSTRAINT "AthleteSessionCompletion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TrainingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteDiveLog" ADD CONSTRAINT "AthleteDiveLog_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteDiveLog" ADD CONSTRAINT "AthleteDiveLog_poolDiveId_fkey" FOREIGN KEY ("poolDiveId") REFERENCES "PoolDive"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteExerciseLog" ADD CONSTRAINT "AthleteExerciseLog_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "Athlete"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AthleteExerciseLog" ADD CONSTRAINT "AthleteExerciseLog_exerciseId_fkey" FOREIGN KEY ("exerciseId") REFERENCES "DrylandExercise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
