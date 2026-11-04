CREATE TABLE "workspace_commands" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" text NOT NULL REFERENCES "organization"("id") ON DELETE cascade,
  "brand_id" text REFERENCES "brands"("id") ON DELETE cascade,
  "operation" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "fingerprint" text NOT NULL,
  "status" text DEFAULT 'running' NOT NULL,
  "result" jsonb,
  "error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "workspace_commands" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_command_key_idx" ON "workspace_commands" ("organization_id", "idempotency_key");
--> statement-breakpoint
CREATE INDEX "workspace_command_brand_idx" ON "workspace_commands" ("brand_id", "created_at");
