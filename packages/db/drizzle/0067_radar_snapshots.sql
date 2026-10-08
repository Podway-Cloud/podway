-- Upgrade Radar: the GTM pod's daily list of fresh upgrade-break reports across the catalog apps,
-- posted to /api/radar/ingest. One row per accepted post; pages read the newest. Additive.
CREATE TABLE IF NOT EXISTS "radar_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL
);
