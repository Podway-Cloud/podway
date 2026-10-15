-- Night auto-update is ON by default (owner, 2026-10-15): an account is in unless its owner switched it
-- off. night_update_tz is now just the timezone (learned from the browser); NULL = not known yet (UTC).
-- Additive, default false: old code ignores it, and every existing account becomes ON.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "night_update_off" boolean DEFAULT false NOT NULL;
