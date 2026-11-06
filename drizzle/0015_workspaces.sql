-- Workspaces: everything a user owned moves into a workspace of their own (named after their
-- business), with them as its owner. Hand-written so that no row is lost on the way.
CREATE TYPE "public"."workspace_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"legacy_user_id" text UNIQUE
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"workspace_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" "workspace_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_members_workspace_id_user_id_pk" PRIMARY KEY("workspace_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint

-- One workspace per user who has a business profile (every user who ever signed in has one).
INSERT INTO "workspaces" ("name", "created_at", "legacy_user_id")
SELECT COALESCE(NULLIF(btrim(bp."business_name"), ''), u."name"), bp."created_at", u."id"
FROM "business_profiles" bp JOIN "user" u ON u."id" = bp."user_id";--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role", "created_at")
SELECT "id", "legacy_user_id", 'owner', "created_at" FROM "workspaces";--> statement-breakpoint

-- The UI language belongs to the person, not the business.
ALTER TABLE "user" ADD COLUMN "ui_locale" text DEFAULT 'id' NOT NULL;--> statement-breakpoint
UPDATE "user" u SET "ui_locale" = bp."ui_locale" FROM "business_profiles" bp WHERE bp."user_id" = u."id";--> statement-breakpoint

-- Business profiles: keyed by workspace.
ALTER TABLE "business_profiles" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "business_profiles" t SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "business_profiles" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "business_profiles" DROP COLUMN "ui_locale";--> statement-breakpoint
ALTER TABLE "business_profiles" ADD PRIMARY KEY ("workspace_id");--> statement-breakpoint
ALTER TABLE "business_profiles" ADD CONSTRAINT "business_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- The rest: user_id becomes workspace_id. A row whose user has no profile (none exist in practice)
-- gets a workspace first, so the NOT NULL below cannot fail.
INSERT INTO "workspaces" ("name", "legacy_user_id")
SELECT u."name", u."id" FROM "user" u
WHERE u."id" NOT IN (SELECT "legacy_user_id" FROM "workspaces")
  AND (EXISTS (SELECT 1 FROM "clients" x WHERE x."user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "catalog_items" x WHERE x."user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "invoices" x WHERE x."user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "payment_accounts" x WHERE x."user_id" = u."id")
    OR EXISTS (SELECT 1 FROM "recurring_schedules" x WHERE x."user_id" = u."id"));--> statement-breakpoint
INSERT INTO "workspace_members" ("workspace_id", "user_id", "role")
SELECT w."id", w."legacy_user_id", 'owner' FROM "workspaces" w
WHERE NOT EXISTS (SELECT 1 FROM "workspace_members" m WHERE m."workspace_id" = w."id");--> statement-breakpoint
INSERT INTO "business_profiles" ("workspace_id", "business_name", "email")
SELECT w."id", u."name", u."email" FROM "workspaces" w JOIN "user" u ON u."id" = w."legacy_user_id"
WHERE NOT EXISTS (SELECT 1 FROM "business_profiles" bp WHERE bp."workspace_id" = w."id");--> statement-breakpoint

ALTER TABLE "catalog_items" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "catalog_items" t SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "catalog_items" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "catalog_items" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "catalog_items" ADD CONSTRAINT "catalog_items_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

ALTER TABLE "clients" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "clients" t SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "clients" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clients_workspace_id_name_idx" ON "clients" USING btree ("workspace_id","name");--> statement-breakpoint

ALTER TABLE "invoices" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "created_by" text;--> statement-breakpoint
UPDATE "invoices" t SET "workspace_id" = w."id", "created_by" = t."user_id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_workspace_id_number_idx" ON "invoices" USING btree ("workspace_id","number");--> statement-breakpoint
CREATE INDEX "invoices_workspace_id_status_idx" ON "invoices" USING btree ("workspace_id","status");--> statement-breakpoint
CREATE INDEX "invoices_workspace_id_issue_date_idx" ON "invoices" USING btree ("workspace_id","issue_date");--> statement-breakpoint

ALTER TABLE "payment_accounts" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
UPDATE "payment_accounts" t SET "workspace_id" = w."id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "payment_accounts" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_accounts" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_one_default_per_workspace" ON "payment_accounts" USING btree ("workspace_id") WHERE "payment_accounts"."is_default" AND "payment_accounts"."archived_at" IS NULL;--> statement-breakpoint

ALTER TABLE "recurring_schedules" ADD COLUMN "workspace_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD COLUMN "created_by" text;--> statement-breakpoint
UPDATE "recurring_schedules" t SET "workspace_id" = w."id", "created_by" = t."user_id" FROM "workspaces" w WHERE w."legacy_user_id" = t."user_id";--> statement-breakpoint
ALTER TABLE "recurring_schedules" ALTER COLUMN "workspace_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_schedules" DROP COLUMN "user_id";--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_schedules_workspace_id_idx" ON "recurring_schedules" USING btree ("workspace_id");--> statement-breakpoint

ALTER TABLE "workspaces" DROP COLUMN "legacy_user_id";
