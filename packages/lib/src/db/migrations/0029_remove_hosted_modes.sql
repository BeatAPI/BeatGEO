-- BeatGEO runs only as a local workspace: no Stripe subscriptions, no SSO, no
-- per-org plan overrides, and no metered premium tracking.
DROP TABLE IF EXISTS "organization_settings" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "sso_provider" CASCADE;--> statement-breakpoint
DROP TABLE IF EXISTS "subscription" CASCADE;--> statement-breakpoint
ALTER TABLE "prompts" DROP COLUMN IF EXISTS "premium_models";--> statement-breakpoint
ALTER TABLE "organization" DROP COLUMN IF EXISTS "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN IF EXISTS "has_report_generator_access";
