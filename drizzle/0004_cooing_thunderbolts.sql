CREATE TYPE "public"."claim_status" AS ENUM('pending', 'accepted', 'rejected');--> statement-breakpoint
CREATE TABLE "payment_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"payer_name" text NOT NULL,
	"paid_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"note" text,
	"proof_url" text,
	"status" "claim_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payment_claims" ADD CONSTRAINT "payment_claims_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payment_claims_invoice_id_status_idx" ON "payment_claims" USING btree ("invoice_id","status");