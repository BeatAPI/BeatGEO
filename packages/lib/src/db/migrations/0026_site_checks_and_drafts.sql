CREATE TABLE "site_audits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_audits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD COLUMN "content_draft" text;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD COLUMN "draft_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD COLUMN "reviewed_revision" integer;--> statement-breakpoint
ALTER TABLE "site_audits" ADD CONSTRAINT "site_audits_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_audits_brand_created_idx" ON "site_audits" USING btree ("brand_id","created_at");