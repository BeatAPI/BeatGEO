CREATE TABLE "brand_data_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"encrypted_credentials" text,
	"config" jsonb,
	"snapshot" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_data_sources" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "brand_data_sources" ADD CONSTRAINT "brand_data_sources_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "brand_data_sources_brand_kind_idx" ON "brand_data_sources" USING btree ("brand_id","kind");
