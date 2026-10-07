-- The /start link (app + ref) an unapproved account arrived with, so approval returns them to it
-- instead of the bare dashboard. Additive + nullable.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "pending_start" text;
