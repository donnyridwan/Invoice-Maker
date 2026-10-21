ALTER TABLE "invoices" ADD COLUMN "fx_base_currency" text;--> statement-breakpoint
-- Rates stored before this column existed were computed against the profile's base at that time; assume it is still the current one.
UPDATE "invoices" SET "fx_base_currency" = "business_profiles"."base_currency" FROM "business_profiles" WHERE "business_profiles"."user_id" = "invoices"."user_id" AND "invoices"."fx_rate_to_base" IS NOT NULL;
