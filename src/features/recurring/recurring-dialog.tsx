"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resolveLocale } from "@/i18n/config";
import { settleAction } from "@/lib/action-result";
import { isIsoDate } from "@/lib/dates";
import {
  nextRunDate,
  RECURRING_FREQUENCIES,
  type RecurringEndType,
  type RecurringFrequency,
} from "@/lib/recurrence";
import { cn } from "@/lib/utils";
import { useServerForm } from "@/lib/use-server-form";
import {
  createScheduleAction,
  getScheduleDialogDataAction,
  updateScheduleAction,
  type ScheduleDialogData,
} from "./actions";
import { sentenceText, type RecurringT } from "./schedule-summary";
import type { RecurringDelivery } from "./schema";

type Values = {
  frequency: RecurringFrequency;
  interval: string;
  nextRunOn: string;
  endType: RecurringEndType;
  endCount: string;
  endDate: string;
  delivery: RecurringDelivery;
};

/** The default first run: one period from today, so the invoice that exists now is not repeated at once. */
function suggestedStart(today: string, frequency: RecurringFrequency, interval: number): string {
  return nextRunDate(today, { frequency, interval, anchorDay: Number(today.slice(8, 10)) });
}

function initialValues(data: ScheduleDialogData): Values {
  const s = data.schedule;
  if (!s) {
    return {
      frequency: "monthly",
      interval: "1",
      nextRunOn: suggestedStart(data.today, "monthly", 1),
      endType: "never",
      endCount: "12",
      endDate: "",
      delivery: "draft",
    };
  }
  return {
    frequency: s.frequency,
    interval: String(s.interval),
    // A date in the past (a paused schedule) would be refused; start from today instead.
    nextRunOn: s.nextRunOn < data.today ? data.today : s.nextRunOn,
    endType: s.endType,
    endCount: s.endCount ? String(s.endCount) : "12",
    endDate: s.endDate ?? "",
    delivery: s.delivery,
  };
}

/**
 * "Jadikan berulang" / "Atur jadwal berulang": frequency, the next invoice date, when it ends and
 * how it is delivered, with a sentence that spells the schedule out. `flush` writes pending editor
 * changes first, so the dialog reads what the user sees.
 */
export function RecurringDialog({
  invoiceId,
  number,
  open,
  onOpenChange,
  flush,
}: {
  invoiceId: string;
  number: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  flush?: () => Promise<void>;
}) {
  // The body reports a save in flight, during which the dialog must not be dismissed.
  const [saving, setSaving] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(next) => (saving ? undefined : onOpenChange(next))}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto">
        {/* Mounted only while open, so every opening starts from a fresh state and a fresh load. */}
        <RecurringBody
          invoiceId={invoiceId}
          number={number}
          flush={flush}
          close={() => onOpenChange(false)}
          onSaving={setSaving}
        />
      </DialogContent>
    </Dialog>
  );
}

function RecurringBody({
  invoiceId,
  number,
  flush,
  close,
  onSaving,
}: {
  invoiceId: string;
  number: string;
  flush?: () => Promise<void>;
  close: () => void;
  onSaving: (saving: boolean) => void;
}) {
  const t = useTranslations("recurring");
  const tAll = useTranslations();
  const locale = resolveLocale(useLocale());
  const router = useRouter();
  const [data, setData] = useState<ScheduleDialogData | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [values, setValues] = useState<Values | null>(null);
  // Until the user picks a date, it follows the frequency.
  const [dateTouched, setDateTouched] = useState(false);

  const editing = data?.schedule ?? null;
  const form = useServerForm<Values>((v) => {
    const input = {
      frequency: v.frequency,
      interval: v.interval,
      nextRunOn: v.nextRunOn,
      endType: v.endType,
      endCount: v.endType === "after_count" ? v.endCount : undefined,
      endDate: v.endType === "on_date" ? v.endDate : undefined,
      delivery: v.delivery,
    };
    return editing ? updateScheduleAction(editing.id, input) : createScheduleAction(invoiceId, input);
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await flush?.();
      } catch {
        // What is loaded below is what is saved; a failed flush shows in the editor.
      }
      const result = await settleAction(() => getScheduleDialogDataAction(invoiceId));
      if (cancelled) return;
      if (result.ok) {
        setData(result.data);
        setValues(initialValues(result.data));
        setDateTouched(Boolean(result.data.schedule));
      } else {
        setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // `flush` is stable per editor; the load happens once per opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceId]);

  const { pending } = form;
  useEffect(() => {
    onSaving(pending);
    return () => onSaving(false);
  }, [onSaving, pending]);

  function change(patch: Partial<Values>) {
    setValues((current) => {
      if (!current || !data) return current;
      const next = { ...current, ...patch };
      const interval = Number(next.interval);
      if (!dateTouched && (patch.frequency || patch.interval !== undefined) && Number.isInteger(interval) && interval >= 1 && interval <= 12) {
        next.nextRunOn = suggestedStart(data.today, next.frequency, interval);
      }
      return next;
    });
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!values) return;
    if (await form.submit(values)) {
      close();
      toast.success(t("toast.saved"));
      router.refresh();
    }
  }

  const reason = !data
    ? null
    : !data.emailEnabled
      ? t("dialog.autoDisabled.emailOff")
      : !data.emailVerified
        ? t("dialog.autoDisabled.notVerified")
        : !data.clientEmail
          ? t("dialog.autoDisabled.noClientEmail")
          : null;

  const interval = values ? Number(values.interval) : NaN;
  const intervalValid = Number.isInteger(interval) && interval >= 1 && interval <= 12;
  const endCount = values ? Number(values.endCount) : NaN;
  const summary =
    values && intervalValid && isIsoDate(values.nextRunOn)
      ? sentenceText(t as RecurringT, locale, {
          frequency: values.frequency,
          interval,
          start: values.nextRunOn,
          endType: values.endType === "after_count" && !(Number.isInteger(endCount) && endCount >= 1) ? "never" : values.endType,
          endCount: Number.isInteger(endCount) ? endCount : null,
          endDate: values.endType === "on_date" && isIsoDate(values.endDate) ? values.endDate : null,
        })
      : null;
  const clamped = values ? values.frequency !== "weekly" && isIsoDate(values.nextRunOn) && Number(values.nextRunOn.slice(8, 10)) > 28 : false;
  const formError = form.errorFor("_form") ?? form.formError;
  const autoDisabled = reason !== null && values?.delivery !== "auto_email";

  function onFrequencyKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!values) return;
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const index = RECURRING_FREQUENCIES.indexOf(values.frequency);
    const next = RECURRING_FREQUENCIES[(index + step + RECURRING_FREQUENCIES.length) % RECURRING_FREQUENCIES.length];
    change({ frequency: next });
    event.currentTarget.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-5" noValidate>
      <DialogHeader>
        <DialogTitle>{editing ? t("dialog.editTitle") : t("dialog.title")}</DialogTitle>
        <DialogDescription>{t("dialog.description", { number: number.trim() || "—" })}</DialogDescription>
      </DialogHeader>

      {loadFailed ? (
        <p role="alert" className="text-sm text-danger">
          {t("dialog.loadFailed")}
        </p>
      ) : !data || !values ? (
        <p role="status" className="flex items-center gap-2 text-sm text-muted">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          {tAll("common.loading")}
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-1.5">
            <span id="recurring-frequency-label" className="text-sm font-medium text-fg">
              {t("dialog.frequency")}
            </span>
            <div
              role="radiogroup"
              aria-labelledby="recurring-frequency-label"
              onKeyDown={onFrequencyKeyDown}
              className="inline-flex w-full rounded-button bg-subtle p-1"
            >
              {RECURRING_FREQUENCIES.map((frequency) => {
                const selected = values.frequency === frequency;
                return (
                  <button
                    key={frequency}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    tabIndex={selected ? 0 : -1}
                    data-value={frequency}
                    onClick={() => change({ frequency })}
                    className={cn(
                      "h-8 flex-1 rounded-button text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                      selected ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg",
                    )}
                  >
                    {t(`dialog.frequencies.${frequency}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("dialog.every")} htmlFor="recurring-interval" error={form.errorFor("interval")}>
              <div className="flex items-center gap-2">
                <Input
                  id="recurring-interval"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={12}
                  value={values.interval}
                  onChange={(event) => change({ interval: event.target.value })}
                  aria-invalid={Boolean(form.errorFor("interval"))}
                  className="w-20 tabular-nums"
                />
                <span className="text-sm text-muted">{t(`unit.${values.frequency}`, { interval: intervalValid ? interval : 2 })}</span>
              </div>
            </FormField>
            <FormField label={t("dialog.nextRunOn")} htmlFor="recurring-next-run" error={form.errorFor("nextRunOn")}>
              <Input
                id="recurring-next-run"
                type="date"
                min={data.today}
                value={values.nextRunOn}
                onChange={(event) => {
                  setDateTouched(true);
                  change({ nextRunOn: event.target.value });
                }}
                aria-invalid={Boolean(form.errorFor("nextRunOn"))}
              />
            </FormField>
          </div>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium text-fg">{t("dialog.ends")}</legend>
            <label className="flex items-center gap-2 text-sm text-fg">
              <input
                type="radio"
                name="recurring-end"
                checked={values.endType === "never"}
                onChange={() => change({ endType: "never" })}
                className="size-4 accent-accent"
              />
              {t("dialog.endNever")}
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
              <input
                id="recurring-end-after"
                type="radio"
                name="recurring-end"
                checked={values.endType === "after_count"}
                onChange={() => change({ endType: "after_count" })}
                className="size-4 accent-accent"
              />
              <Label htmlFor="recurring-end-after" className="font-normal">
                {t("dialog.endAfter")}
              </Label>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={120}
                aria-label={t("dialog.endCount")}
                aria-invalid={Boolean(form.errorFor("endCount"))}
                disabled={values.endType !== "after_count"}
                value={values.endCount}
                onChange={(event) => change({ endCount: event.target.value })}
                className="w-20 tabular-nums"
              />
              <span className="text-muted">{t("dialog.endTimes")}</span>
            </div>
            {form.errorFor("endCount") ? <p className="text-xs text-danger">{form.errorFor("endCount")}</p> : null}
            <div className="flex flex-wrap items-center gap-2 text-sm text-fg">
              <input
                id="recurring-end-on"
                type="radio"
                name="recurring-end"
                checked={values.endType === "on_date"}
                onChange={() => change({ endType: "on_date" })}
                className="size-4 accent-accent"
              />
              <Label htmlFor="recurring-end-on" className="font-normal">
                {t("dialog.endOn")}
              </Label>
              <Input
                type="date"
                aria-label={t("dialog.endDate")}
                aria-invalid={Boolean(form.errorFor("endDate"))}
                disabled={values.endType !== "on_date"}
                min={values.nextRunOn || data.today}
                value={values.endDate}
                onChange={(event) => change({ endDate: event.target.value })}
                className="w-auto"
              />
            </div>
            {form.errorFor("endDate") ? <p className="text-xs text-danger">{form.errorFor("endDate")}</p> : null}
          </fieldset>

          <fieldset className="flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-sm font-medium text-fg">{t("dialog.delivery")}</legend>
            <label className="flex items-start gap-2 text-sm text-fg">
              <input
                type="radio"
                name="recurring-delivery"
                checked={values.delivery === "draft"}
                onChange={() => change({ delivery: "draft" })}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                {t("dialog.deliveryDraft")}
                <span className="block text-xs text-muted">{t("dialog.deliveryDraftHint")}</span>
              </span>
            </label>
            <label className={cn("flex items-start gap-2 text-sm", autoDisabled ? "text-muted" : "text-fg")}>
              <input
                type="radio"
                name="recurring-delivery"
                checked={values.delivery === "auto_email"}
                disabled={autoDisabled}
                onChange={() => change({ delivery: "auto_email" })}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                {t("dialog.deliveryEmail")}
                <span className="block text-xs text-muted">{reason ?? t("dialog.deliveryEmailHint")}</span>
              </span>
            </label>
            {form.errorFor("delivery") ? <p className="text-xs text-danger">{form.errorFor("delivery")}</p> : null}
          </fieldset>

          {summary ? (
            <div className="rounded-card bg-subtle px-4 py-3 text-sm text-fg" aria-live="polite">
              <p>{summary}</p>
              {clamped ? <p className="mt-1 text-xs text-muted">{t("clamp")}</p> : null}
            </div>
          ) : null}
        </>
      )}

      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <DialogFooter>
        <Button type="button" variant="secondary" disabled={pending} onClick={close}>
          {tAll("common.cancel")}
        </Button>
        <Button type="submit" disabled={pending || !values}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : null}
          {tAll("common.save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
