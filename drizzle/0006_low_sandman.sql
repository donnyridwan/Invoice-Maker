CREATE TYPE "public"."recurring_delivery" AS ENUM('draft', 'auto_email');--> statement-breakpoint
CREATE TYPE "public"."recurring_end" AS ENUM('never', 'after_count', 'on_date');--> statement-breakpoint
CREATE TYPE "public"."recurring_frequency" AS ENUM('weekly', 'monthly', 'yearly');--> statement-breakpoint
CREATE TABLE "recurring_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source_invoice_id" uuid,
	"frequency" "recurring_frequency" NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"anchor_day" integer NOT NULL,
	"next_run_on" date NOT NULL,
	"end_type" "recurring_end" DEFAULT 'never' NOT NULL,
	"end_count" integer,
	"end_date" date,
	"runs_done" integer DEFAULT 0 NOT NULL,
	"delivery" "recurring_delivery" DEFAULT 'draft' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "recurring_schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD CONSTRAINT "recurring_schedules_source_invoice_id_invoices_id_fk" FOREIGN KEY ("source_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurring_schedules_active_next_run_on_idx" ON "recurring_schedules" USING btree ("active","next_run_on");--> statement-breakpoint
CREATE INDEX "recurring_schedules_user_id_idx" ON "recurring_schedules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recurring_schedules_source_invoice_id_idx" ON "recurring_schedules" USING btree ("source_invoice_id");--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_schedule_id_recurring_schedules_id_fk" FOREIGN KEY ("recurring_schedule_id") REFERENCES "public"."recurring_schedules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_recurring_schedule_id_issue_date_idx" ON "invoices" USING btree ("recurring_schedule_id","issue_date");