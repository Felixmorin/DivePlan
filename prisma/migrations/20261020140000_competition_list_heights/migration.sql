ALTER TABLE "CompetitionDiveList"
ADD COLUMN "heights" "PoolHeight"[] NOT NULL DEFAULT ARRAY[]::"PoolHeight"[];
