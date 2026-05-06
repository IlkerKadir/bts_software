-- Default visibility for newly created Projects flips from
-- CREATOR_ONLY to EVERYONE per client request: projects should be
-- visible to the whole team by default; the user can hide their own
-- when needed. Existing rows keep their stored visibility — only the
-- column default changes for inserts that omit the column.

ALTER TABLE "Project" ALTER COLUMN "visibility" SET DEFAULT 'EVERYONE';
