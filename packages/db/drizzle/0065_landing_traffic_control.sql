-- Runtime-editable homepage traffic (admin /admin/experiments): the split lives in the DB, not code.
-- Additive + nullable: NULL weights = the coded allocation, so old app code keeps working.
ALTER TABLE "landing_experiment_runs" ADD COLUMN IF NOT EXISTS "weights" jsonb;
--> statement-breakpoint
ALTER TABLE "landing_experiment_runs" ADD COLUMN IF NOT EXISTS "period" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "landing_experiment_runs" ADD COLUMN IF NOT EXISTS "period_started_at" timestamp;
--> statement-breakpoint
ALTER TABLE "landing_experiment_audit" ADD COLUMN IF NOT EXISTS "previous_weights" jsonb;
--> statement-breakpoint
ALTER TABLE "landing_experiment_audit" ADD COLUMN IF NOT EXISTS "next_weights" jsonb;
--> statement-breakpoint
ALTER TABLE "landing_experiment_audit" DROP CONSTRAINT IF EXISTS "landing_audit_action_check";
--> statement-breakpoint
ALTER TABLE "landing_experiment_audit" ADD CONSTRAINT "landing_audit_action_check" CHECK ("landing_experiment_audit"."action" in ('stop', 'pin', 'unpin', 'traffic'));
