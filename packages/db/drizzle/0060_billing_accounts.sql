CREATE TABLE "billing_accounts" (
	"owner_id" text PRIMARY KEY NOT NULL,
	"stripe_customer_id" text,
	"credit_cents" integer DEFAULT 0 NOT NULL,
	"has_card" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing_accounts" ADD CONSTRAINT "billing_accounts_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
