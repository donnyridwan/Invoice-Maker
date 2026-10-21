CREATE TABLE "action_rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "action_rate_limits_window_start_idx" ON "action_rate_limits" USING btree ("window_start");