-- Add optional Proje Yeri (project location) column.
-- Null for existing rows; stores a Turkish province name or "Yurtdışı".
ALTER TABLE "Project" ADD COLUMN "location" TEXT;
