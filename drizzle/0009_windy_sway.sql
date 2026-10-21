ALTER TABLE "invoices" ADD COLUMN "email_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_schedules" ADD COLUMN "failed_runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_email_pending_idx" ON "invoices" USING btree ("created_at") WHERE "invoices"."email_pending";