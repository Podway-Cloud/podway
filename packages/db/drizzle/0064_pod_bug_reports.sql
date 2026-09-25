CREATE TABLE "report_fingerprints" (
	"fingerprint" text PRIMARY KEY NOT NULL,
	"area" text NOT NULL,
	"summary" text NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"first_seen" timestamp DEFAULT now() NOT NULL,
	"last_seen" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pod_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"area" text NOT NULL,
	"summary" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"bundle" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pod_reports" ADD CONSTRAINT "pod_reports_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "pod_reports_pod_idx" ON "pod_reports" USING btree ("pod_id");
--> statement-breakpoint
CREATE INDEX "pod_reports_fp_idx" ON "pod_reports" USING btree ("fingerprint");
