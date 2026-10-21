CREATE TABLE "exchange_rates" (
	"date" date NOT NULL,
	"currency" text NOT NULL,
	"per_eur" numeric(20, 10) NOT NULL,
	CONSTRAINT "exchange_rates_date_currency_pk" PRIMARY KEY("date","currency")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fx_rate_to_base" numeric(20, 10);--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fx_rate_date" date;