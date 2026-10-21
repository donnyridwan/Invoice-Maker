import { NextResponse } from "next/server";
import { runDueSchedules } from "@/features/recurring/run";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { todayInJakarta } from "@/lib/dates";

// Rendering a PDF for each auto-emailed invoice takes a while.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Vercel Cron: creates the invoices of the recurring schedules that are due. Needs `Authorization: Bearer ${CRON_SECRET}`. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    return NextResponse.json(await runDueSchedules(todayInJakarta()));
  } catch (error) {
    console.error("[cron/recurring] failed", error);
    return NextResponse.json({ error: "recurring_run_failed" }, { status: 500 });
  }
}
