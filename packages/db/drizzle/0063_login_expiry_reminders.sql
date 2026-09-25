ALTER TABLE "pods" ADD COLUMN "claude_login_expires_at" timestamp;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "reminder_emails" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
CREATE TABLE "auth_notices" (
	"pod_id" text NOT NULL,
	"agent" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"threshold" text NOT NULL,
	"owner_id" text NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "auth_notices_pod_id_agent_expires_at_threshold_pk" PRIMARY KEY("pod_id","agent","expires_at","threshold")
);
--> statement-breakpoint
ALTER TABLE "auth_notices" ADD CONSTRAINT "auth_notices_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "user"("id") ON DELETE cascade ON UPDATE no action;
