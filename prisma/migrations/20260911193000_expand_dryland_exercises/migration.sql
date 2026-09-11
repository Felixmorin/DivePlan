ALTER TABLE "DrylandExercise"
  ADD COLUMN "bodyArea" TEXT,
  ADD COLUMN "setup" TEXT,
  ADD COLUMN "coachNotes" TEXT,
  ADD COLUMN "restSeconds" INTEGER,
  ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX "DrylandExercise_archivedAt_category_name_idx"
  ON "DrylandExercise"("archivedAt", "category", "name");
