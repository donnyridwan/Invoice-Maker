"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Pause, Pencil, Play, Repeat, Square } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { resolveLocale } from "@/i18n/config";
import { formatDocDate } from "@/lib/dates";
import { scheduleStatus } from "@/lib/recurrence";
import { actionErrorMessage } from "@/lib/validation-message";
import { deleteScheduleAction, pauseScheduleAction, resumeScheduleAction } from "./actions";
import { RecurringDialog } from "./recurring-dialog";
import { endLabel, ruleText, type RecurringT, type ScheduleView } from "./schedule-summary";
import type { ActionResult } from "@/lib/action-result";

const STATUS_VARIANT = { active: "success", paused: "warning", stopped: "danger", finished: "neutral" } as const;
const KNOWN_ERRORS = new Set([
  "sourceUnavailable",
  "runFailed",
  "emailNotVerified",
  "emailDisabled",
  "clientEmailMissing",
  "emailFailed",
  "tooManyFailures",
  "rateLimited",
]);

type Busy = "pause" | "resume" | "stop" | null;

/**
 * The recurring schedule of an invoice: what it repeats, when it runs next, how many invoices it
 * made, the last problem (in red) and Jeda / Lanjutkan / Ubah / Hentikan. Without a schedule it
 * offers to make the invoice recurring.
 */
export function ScheduleCard({
  invoiceId,
  number,
  schedule,
  flush,
}: {
  invoiceId: string;
  number: string;
  schedule: ScheduleView | null;
  flush?: () => Promise<void>;
}) {
  const t = useTranslations("recurring");
  const tAll = useTranslations();
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [stopOpen, setStopOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const rt = t as unknown as RecurringT;

  async function run(kind: Exclude<Busy, null>, work: () => Promise<ActionResult>, success: string) {
    setBusy(kind);
    try {
      const result = await work();
      if (!result.ok) {
        toast.error(actionErrorMessage(tAll, result));
      } else {
        toast.success(success);
        router.refresh();
      }
    } catch {
      toast.error(tAll("errors.unknown"));
    }
    setStopOpen(false);
    setBusy(null);
  }

  const dialog = (
    <RecurringDialog invoiceId={invoiceId} number={number} open={dialogOpen} onOpenChange={setDialogOpen} flush={flush} />
  );

  if (!schedule) {
    return (
      <Card role="region" aria-labelledby="schedule-title" className="p-5">
        <h2 id="schedule-title" className="text-base font-semibold text-fg">
          {t("card.title")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("card.empty")}</p>
        <Button variant="secondary" size="sm" className="mt-3" onClick={() => setDialogOpen(true)}>
          <Repeat className="size-4" />
          {t("makeRecurring")}
        </Button>
        {dialog}
      </Card>
    );
  }

  const status = scheduleStatus(schedule);
  const end = endLabel(rt, locale, schedule);
  const error = schedule.lastError ? t(`lastError.${KNOWN_ERRORS.has(schedule.lastError) ? schedule.lastError : "other"}`) : null;
  const working = busy !== null;
  // A schedule whose source is gone can never run again, so there is nothing to resume.
  const canResume = schedule.lastError !== "sourceUnavailable";

  return (
    <Card role="region" aria-labelledby="schedule-title" className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="schedule-title" className="text-base font-semibold text-fg">
          {t("card.title")}
        </h2>
        <Badge variant={STATUS_VARIANT[status]}>{t(`status.${status}`)}</Badge>
      </div>
      <p className="mt-2 text-sm text-fg">
        {ruleText(rt, locale, { frequency: schedule.frequency, interval: schedule.interval, date: schedule.nextRunOn })}
      </p>
      <ul className="mt-2 flex flex-col gap-0.5 text-sm text-muted">
        {status === "active" || status === "paused" ? <li>{t("card.next", { date: formatDocDate(schedule.nextRunOn, locale) })}</li> : null}
        <li>{t("card.done", { count: schedule.runsDone })}</li>
        {end ? <li>{end}</li> : null}
        <li>{t(`card.delivery.${schedule.delivery}`)}</li>
      </ul>
      {error ? (
        <p role="alert" className="mt-3 rounded-md bg-badge-danger-bg px-3 py-2 text-sm text-badge-danger-fg">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {schedule.active ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => void run("pause", () => pauseScheduleAction(schedule.id), t("toast.paused"))}
          >
            {busy === "pause" ? <Loader2 className="size-4 animate-spin" /> : <Pause className="size-4" />}
            {t("card.pause")}
          </Button>
        ) : canResume ? (
          <Button
            variant="secondary"
            size="sm"
            disabled={working}
            onClick={() => void run("resume", () => resumeScheduleAction(schedule.id), t("toast.resumed"))}
          >
            {busy === "resume" ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
            {t("card.resume")}
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" disabled={working} onClick={() => setDialogOpen(true)}>
          <Pencil className="size-4" />
          {t("card.edit")}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={working}
          onClick={() => setStopOpen(true)}
          className="text-danger hover:text-danger"
        >
          <Square className="size-4" />
          {t("card.stop")}
        </Button>
      </div>

      {dialog}
      <Dialog open={stopOpen} onOpenChange={(next) => (busy === "stop" ? undefined : setStopOpen(next))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("stop.title")}</DialogTitle>
            <DialogDescription>{t("stop.description", { number: number.trim() || "—" })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy === "stop"} onClick={() => setStopOpen(false)}>
              {tAll("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy === "stop"}
              onClick={() => void run("stop", () => deleteScheduleAction(schedule.id), t("toast.stopped"))}
            >
              {t("stop.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
