CREATE TABLE "custom_domains" (
	"id" text PRIMARY KEY NOT NULL,
	"pod_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"hostname" text NOT NULL,
	"record_type" text DEFAULT 'cname' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verify_token" text NOT NULL,
	"verified_at" timestamp,
	"cert_status" text DEFAULT 'none' NOT NULL,
	"cert_not_after" timestamp,
	"error" text,
	"last_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "custom_domains_hostname_idx" ON "custom_domains" ("hostname");
