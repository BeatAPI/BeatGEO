CREATE TABLE "analysis_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analysis_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD COLUMN "kind" text DEFAULT 'geo' NOT NULL;--> statement-breakpoint
ALTER TABLE "optimization_actions" ADD COLUMN "seo_baseline" jsonb;--> statement-breakpoint
ALTER TABLE "analysis_evidence" ADD CONSTRAINT "analysis_evidence_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analysis_evidence_brand_kind_idx" ON "analysis_evidence" USING btree ("brand_id","kind","captured_at");