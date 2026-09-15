CREATE TABLE "billing_delinquencies" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"since" timestamp DEFAULT now() NOT NULL,
	"last_notified_day" integer DEFAULT 0 NOT NULL,
	"amount_due_cents" integer DEFAULT 0 NOT NULL,
	"suspended_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_delinquencies" ADD CONSTRAINT "billing_delinquencies_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "pods" ADD COLUMN "nonpayment_suspended_at" timestamp;
