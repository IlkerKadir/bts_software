-- Adds the canManageSettings admin flag to Role. Additive only, all
-- existing rows default to false so current permissions are preserved.
-- Run the following one-liner manually after deploying if you want
-- existing admins to get the new capability:
--
--   UPDATE "Role" SET "canManageSettings" = true WHERE "canManageUsers" = true;
ALTER TABLE "Role" ADD COLUMN "canManageSettings" BOOLEAN NOT NULL DEFAULT false;
