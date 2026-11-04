CREATE TABLE "runtime_heartbeats" (
	"id" uuid PRIMARY KEY NOT NULL,
	"service" text NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "runtime_heartbeats" ENABLE ROW LEVEL SECURITY;