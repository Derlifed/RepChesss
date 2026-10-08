CREATE TABLE "accounts" (
	"user_id" text PRIMARY KEY,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" ("user_id");