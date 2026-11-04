CREATE TABLE public."CompetitionSimulation" (
  id text PRIMARY KEY,
  "sessionId" text NOT NULL UNIQUE REFERENCES public."TrainingSession"(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'READY' CHECK (status IN ('READY', 'LIVE', 'COMPLETED')),
  "currentTurnIndex" integer NOT NULL DEFAULT 0 CHECK ("currentTurnIndex" >= 0),
  turns jsonb NOT NULL,
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp without time zone NOT NULL DEFAULT now()
);

CREATE TABLE public."CompetitionSimulationScore" (
  id text PRIMARY KEY,
  "simulationId" text NOT NULL REFERENCES public."CompetitionSimulation"(id) ON DELETE CASCADE,
  "turnIndex" integer NOT NULL CHECK ("turnIndex" >= 0),
  "judgeAthleteId" text REFERENCES public."Athlete"(id) ON DELETE CASCADE,
  "judgeCoachId" text REFERENCES public."Coach"(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating BETWEEN 0 AND 10),
  "createdAt" timestamp without time zone NOT NULL DEFAULT now(),
  CHECK (("judgeAthleteId" IS NULL) <> ("judgeCoachId" IS NULL))
);

CREATE UNIQUE INDEX "CompetitionSimulationScore_athlete_judge_key"
  ON public."CompetitionSimulationScore" ("simulationId", "turnIndex", "judgeAthleteId")
  WHERE "judgeAthleteId" IS NOT NULL;
CREATE UNIQUE INDEX "CompetitionSimulationScore_coach_judge_key"
  ON public."CompetitionSimulationScore" ("simulationId", "turnIndex", "judgeCoachId")
  WHERE "judgeCoachId" IS NOT NULL;
CREATE INDEX "CompetitionSimulationScore_turn_idx"
  ON public."CompetitionSimulationScore" ("simulationId", "turnIndex");
