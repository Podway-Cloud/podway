-- App watch (owner, 2026-10-12): Podway checks app pods every 5 min, restarts a down app, emails the
-- owner and wakes the agent. On by default; the owner can switch it off per pod. Additive.
ALTER TABLE "pods" ADD COLUMN IF NOT EXISTS "app_watch" boolean DEFAULT true NOT NULL;
