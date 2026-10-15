CREATE TABLE "collection_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_key" text NOT NULL,
	"brand_id" text NOT NULL,
	"prompt_id" uuid NOT NULL,
	"prompt_value" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"observation" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "collection_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "optimization_actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"baseline" jsonb NOT NULL,
	"status" text DEFAULT 'planned' NOT NULL,
	"implementation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"applied_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "optimization_actions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collection_attempts" ADD CONSTRAINT "collection_attempts_prompt_id_prompts_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."prompts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD CONSTRAINT "optimization_actions_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "collection_attempt_key_idx" ON "collection_attempts" USING btree ("attempt_key");--> statement-breakpoint
CREATE INDEX "collection_brand_started_idx" ON "collection_attempts" USING btree ("brand_id","started_at");--> statement-breakpoint
CREATE INDEX "optimization_brand_created_idx" ON "optimization_actions" USING btree ("brand_id","created_at");