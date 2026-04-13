-- Soft-delete marker for users. Non-null = admin deleted the user.
-- The row stays so foreign keys on Quote / Order / PriceHistory keep
-- resolving; every listing query filters `deletedAt IS NULL`.
ALTER TABLE "User" ADD COLUMN "deletedAt" TIMESTAMP(3);
