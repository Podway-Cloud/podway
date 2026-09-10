CREATE TABLE "credit_grants" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"cents" integer NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_grants" ADD CONSTRAINT "credit_grants_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grants_owner_reason_idx" ON "credit_grants" ("owner_id","reason");
