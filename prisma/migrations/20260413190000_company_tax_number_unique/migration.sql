-- Enforce Company.taxNumber uniqueness (vergi no).
--
-- NULLs are allowed and do not conflict under PostgreSQL's default
-- unique-index behavior, so companies without a tax number can still
-- coexist. If two existing rows share the same non-null taxNumber this
-- migration will FAIL — that's intentional so the operator can
-- reconcile the duplicates manually before retrying.

CREATE UNIQUE INDEX "Company_taxNumber_key" ON "Company"("taxNumber");
