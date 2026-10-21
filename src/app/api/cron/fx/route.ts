import { NextResponse } from "next/server";
import { fetchLatestRates } from "@/features/fx/fetch-rates";
import { saveRates } from "@/features/fx/queries";
import { isAuthorizedCron } from "@/lib/cron-auth";

export const maxDuration = 30;
export const dynamic = "force-dynamic";

/** Vercel Cron: stores the latest daily exchange rates. Needs `Authorization: Bearer ${CRON_SECRET}`. */
export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const { date, rates } = await fetchLatestRates();
    const saved = await saveRates(date, rates);
    return NextResponse.json({ date, saved });
  } catch (error) {
    console.error("[cron/fx] failed to update exchange rates", error);
    return NextResponse.json({ error: "fx_update_failed" }, { status: 502 });
  }
}
