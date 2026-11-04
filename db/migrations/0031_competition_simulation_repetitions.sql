CREATE TABLE IF NOT EXISTS public."CompetitionSimulationRepetition" (
  "simulationId" text NOT NULL REFERENCES public."CompetitionSimulation"(id) ON DELETE CASCADE,
  "turnIndex" integer NOT NULL CHECK ("turnIndex" >= 0),
  "athleteId" text NOT NULL REFERENCES public."Athlete"(id) ON DELETE CASCADE,
  "diveCode" text NOT NULL,
  "diveName" text NOT NULL,
  height text NOT NULL,
  "completedAt" timestamp without time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("simulationId", "turnIndex")
);
CREATE INDEX IF NOT EXISTS "CompetitionSimulationRepetition_athlete_completed_idx"
  ON public."CompetitionSimulationRepetition" ("athleteId", "completedAt");

INSERT INTO public."CompetitionSimulationRepetition" ("simulationId", "turnIndex", "athleteId", "diveCode", "diveName", height, "completedAt")
SELECT cs.id, (turn.position - 1)::int, turn.value->>'athleteId', turn.value->>'diveCode', turn.value->>'diveName', turn.value->>'height', cs."updatedAt"
FROM public."CompetitionSimulation" cs
CROSS JOIN LATERAL jsonb_array_elements(cs.turns) WITH ORDINALITY AS turn(value, position)
WHERE cs.status='COMPLETED' OR (cs.status='LIVE' AND turn.position - 1 < cs."currentTurnIndex")
ON CONFLICT ("simulationId", "turnIndex") DO NOTHING;

CREATE OR REPLACE VIEW public."AthleteDiveRepetition" AS
SELECT l."athleteId", l."sessionId", COALESCE(l."actualDiveCode", d."diveCode") AS "diveCode",
  COALESCE(l."actualDiveName", d."diveName") AS "diveName", s.height::text AS height,
  s.label AS "heightLabel", l."familyOverride", l."repetitionsCompleted", l.timestamp
FROM public."AthleteDiveLog" l
JOIN public."PoolDive" d ON d.id=l."poolDiveId"
JOIN public."PoolSection" s ON s.id=d."poolSectionId"
UNION ALL
SELECT r."athleteId", cs."sessionId", r."diveCode", r."diveName", r.height,
  r.height AS "heightLabel", NULL::text AS "familyOverride", 1 AS "repetitionsCompleted", r."completedAt" AS timestamp
FROM public."CompetitionSimulationRepetition" r
JOIN public."CompetitionSimulation" cs ON cs.id=r."simulationId";
