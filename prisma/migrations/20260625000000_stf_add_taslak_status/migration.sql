-- STF: add the new TASLAK status value. Must commit before it can be USED
-- (Postgres won't allow a new enum value in the same tx that adds it), so the
-- data remap lives in a separate migration file (20260625010000).
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'TASLAK';
