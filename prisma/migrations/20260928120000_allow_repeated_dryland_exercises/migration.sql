ALTER TABLE "DrylandBlockExercise" DROP CONSTRAINT "DrylandBlockExercise_pkey";
ALTER TABLE "DrylandBlockExercise" ADD CONSTRAINT "DrylandBlockExercise_pkey" PRIMARY KEY ("blockId", "order");
