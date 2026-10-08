CREATE TABLE "usernames" (
	"user_id" text PRIMARY KEY,
	"username" text NOT NULL UNIQUE,
	"created_at" timestamp DEFAULT now() NOT NULL
);
