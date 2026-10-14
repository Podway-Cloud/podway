-- Night auto-update (owner, 2026-10-13): the owner's IANA timezone when "Update idle pods automatically
-- at night" is ON; NULL = off (the default). Nullable + additive: old code ignores it.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "night_update_tz" text;
