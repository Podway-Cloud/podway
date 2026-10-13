-- "Always choose recommended" (owner, 2026-10-11): when on, the pod-agent picks the first option of each
-- question after ~10 min with no reply — only when it is labelled "(Recommended)" and nothing gated is
-- mentioned. Off by default (it once happened by accident: 2026-10-06). Additive.
ALTER TABLE "pods" ADD COLUMN IF NOT EXISTS "relentless_autopick" boolean DEFAULT false NOT NULL;
