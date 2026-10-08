-- Free-pod offers (owner, 2026-10-08): which offer link this account claimed (e.g. selfhst-insider,
-- noted-jeremy), and when. One free pod per offer rules in @podway/shared FREE_POD_OFFERS; each offer
-- is capped by claims. Null = no offer. Additive, nullable.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "free_offer" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "free_offer_since" timestamp;
