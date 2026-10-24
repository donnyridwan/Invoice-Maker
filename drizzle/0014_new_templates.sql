ALTER TABLE "business_profiles" ALTER COLUMN "default_template" SET DEFAULT 'highlight';--> statement-breakpoint
-- The minimal, classic and modern templates are gone: each maps to its closest replacement.
UPDATE "business_profiles" SET "default_template" = CASE "default_template" WHEN 'classic' THEN 'line' WHEN 'modern' THEN 'card' ELSE 'highlight' END WHERE "default_template" NOT IN ('highlight', 'line', 'card');--> statement-breakpoint
UPDATE "invoices" SET "template" = CASE "template" WHEN 'classic' THEN 'line' WHEN 'modern' THEN 'card' ELSE 'highlight' END WHERE "template" NOT IN ('highlight', 'line', 'card');
