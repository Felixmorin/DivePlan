CREATE TABLE public."AthleteManualDiveRepetition" (
  id text PRIMARY KEY,
  "athleteId" text NOT NULL REFERENCES public."Athlete"(id) ON DELETE CASCADE,
  "diveCode" text NOT NULL CHECK (length("diveCode") BETWEEN 1 AND 12),
  "diveName" text NOT NULL CHECK (length("diveName") BETWEEN 1 AND 80),
  height text NOT NULL CHECK (height IN ('ONE_METER','THREE_METER','PLATFORM','CUSTOM')),
  "heightLabel" text CHECK (length("heightLabel") BETWEEN 1 AND 80),
  "familyOverride" text NOT NULL CHECK ("familyOverride" IN ('Avant','Arriere','Renverse','Retourne','Vrille','Equilibre')),
  "repetitionsCompleted" integer NOT NULL CHECK ("repetitionsCompleted" >= 0),
  timestamp timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "AthleteManualDiveRepetition_athlete_timestamp_idx"
  ON public."AthleteManualDiveRepetition" ("athleteId", timestamp);

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
JOIN public."CompetitionSimulation" cs ON cs.id=r."simulationId"
UNION ALL
SELECT m."athleteId", NULL::text AS "sessionId", m."diveCode", m."diveName", m.height,
  m."heightLabel", m."familyOverride", m."repetitionsCompleted", m.timestamp
FROM public."AthleteManualDiveRepetition" m;
