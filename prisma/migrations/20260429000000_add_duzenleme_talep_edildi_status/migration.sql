-- New explicit status for "approver requested edits" — replaces the
-- TASLAK fallback so the salesperson can distinguish their own retract
-- (TASLAK) from an approver kicking the quote back (DUZENLEME_TALEP_EDILDI).
-- Pure enum-add; no data migration. Existing TASLAK rows that came
-- from a prior approver-rejection stay TASLAK — only new rejections
-- after deploy land in the new status.

ALTER TYPE "QuoteStatus" ADD VALUE 'DUZENLEME_TALEP_EDILDI';
