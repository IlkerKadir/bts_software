-- Splits product-catalog delete out of the catch-all `canDelete` flag.
-- Salespeople routinely have canDelete=true so they can remove their
-- own draft quotes, companies and projects, but the client never wanted
-- them able to wipe rows out of the product master catalog. The new
-- column defaults to false so non-admin roles do NOT silently gain the
-- capability — that's the whole point of the split.
--
-- Existing admin-equivalent roles (canManageUsers=true) are auto-granted
-- the new flag in the same migration so admins don't regress on deploy.

ALTER TABLE "Role" ADD COLUMN "canDeleteProducts" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Role" SET "canDeleteProducts" = true WHERE "canManageUsers" = true;
