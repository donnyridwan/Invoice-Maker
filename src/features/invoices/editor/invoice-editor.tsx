"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buildInvoiceDocument } from "@/documents/build-document";
import { resolveLocale } from "@/i18n/config";
import { translateValidation } from "@/lib/validation-message";
import { cn } from "@/lib/utils";
import { Button, buttonVariants } from "@/components/ui/button";
import { formatDocDate, isIsoDate } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { isCurrencyCode } from "@/lib/currencies";
import { saveInvoiceDraftAction } from "../actions";
import { useAutosave, type SaveOutcome } from "../autosave";
import {
  evaluateEditor,
  mapServerErrors,
  toDraftInput,
  toPreviewSource,
  type AccountOption,
  type CatalogOption,
  type ClientOption,
  type EditorErrors,
  type EditorState,
} from "../editor-state";
import type { InvoiceDraftInput } from "../schema";
import type { BusinessSnapshot } from "../snapshots";
import type { DisplayStatus } from "../display-status";
import type { Invoice } from "../queries";
import { AmountHero } from "./amount-hero";
import { AppearanceBar } from "./appearance-section";
import { ClientSection } from "./client-section";
import { DetailsSection } from "./details-section";
import { SendMenu } from "../send-menu";
import { EditorHeader } from "./editor-header";
import { ScheduleCard } from "@/features/recurring/schedule-card";
import type { ScheduleView } from "@/features/recurring/schedule-summary";
import { EditorMenu } from "./editor-menu";
import { EDITOR_STEPS, EditorStepper, isEditorStep, StepRecap, stepsWithErrors, type EditorStep } from "./editor-steps";
import type { EditorSectionProps } from "./editor-section";
import { ItemsSection } from "./items-section";
import { NotesSection } from "./notes-section";
import { PaymentSection } from "./payment-section";
import { PreviewPane } from "./preview-pane";
import { TotalsSection } from "./totals-section";

type Tab = "form" | "preview";

/**
 * The invoice editor: form on the left, a preview panel with the live A4 document on the right (tabs
 * on small screens). The form is split into three steps (client & details, items, payment) that can
 * be opened in any order: from the step bar, the back / next buttons by the total, or the recap of
 * the earlier steps. The open step is kept in the URL hash, so a reload stays on it.
 * Every change is validated on the client; a valid form is autosaved (debounced), an invalid one
 * marks the offending fields and keeps the last saved version on the server.
 */
export function InvoiceEditor({
  invoiceId,
  status,
  displayStatus,
  initial,
  business,
  clients: initialClients,
  accounts,
  catalog,
  emailEnabled,
  recurringSchedule,
}: {
  invoiceId: string;
  status: Invoice["status"];
  /** The label for the header: the stored status refined by views and the due date. */
  displayStatus: DisplayStatus;
  initial: EditorState;
  business: BusinessSnapshot;
  clients: ClientOption[];
  accounts: AccountOption[];
  catalog: CatalogOption[];
  emailEnabled: boolean;
  /** The recurring schedule that repeats this invoice, if any. */
  recurringSchedule: ScheduleView | null;
}) {
  const t = useTranslations("invoices.editor");
  const tAll = useTranslations();
  const locale = resolveLocale(useLocale());
  const locked = status === "paid" || status === "void";

  const [state, setState] = useState(initial);
  const stateRef = useRef(initial);
  const [clientErrors, setClientErrors] = useState<EditorErrors>({});
  const [serverErrors, setServerErrors] = useState<EditorErrors>({});
  const [tab, setTab] = useState<Tab>("form");
  const [step, setStep] = useState<EditorStep>("details");
  const formPanelRef = useRef<HTMLDivElement>(null);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  // Set when the user changes step, so the new step's heading takes focus (not on the first render).
  const focusStep = useRef(false);
  // Clients created from the editor join the ones the page loaded.
  const [clients, setClients] = useState(initialClients);

  const autosave = useAutosave<InvoiceDraftInput>(async (input, isCurrent): Promise<SaveOutcome> => {
    const result = await saveInvoiceDraftAction(invoiceId, input);
    if (result.ok) return "saved";
    if (result.fieldErrors) {
      if (isCurrent()) setServerErrors(mapServerErrors(stateRef.current, result.fieldErrors));
      return "invalid";
    }
    return "error";
  });
  const { schedule, markInvalid } = autosave;

  const update: EditorSectionProps["update"] = (change) => {
    const next = { ...stateRef.current, ...(typeof change === "function" ? change(stateRef.current) : change) };
    stateRef.current = next;
    setState(next);
    setServerErrors({});

    const result = toDraftInput(next, locale);
    if (result.ok) {
      setClientErrors({});
      schedule(result.input);
    } else {
      setClientErrors(result.errors);
      markInvalid();
    }
  };

  const errors = useMemo(() => ({ ...serverErrors, ...clientErrors }), [serverErrors, clientErrors]);
  const evaluation = useMemo(() => evaluateEditor(state, locale), [state, locale]);

  // The preview may trail a keystroke behind, so typing stays responsive.
  const previewState = useDeferredValue(state);
  const previewContext = useMemo(
    () => ({ business, clients, accounts: accounts.map((account) => account.snapshot), status }),
    [business, clients, accounts, status],
  );
  const doc = useMemo(
    () => buildInvoiceDocument(toPreviewSource(previewState, previewContext, locale)),
    [previewState, previewContext, locale],
  );

  // The PDF is rendered from the saved invoice, so pending edits are written before it is fetched.
  // Modified clicks (new tab, save link as) keep the plain link and its behaviour.
  const downloadPdf = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const url = event.currentTarget.href;
    try {
      await autosave.flush();
    } catch {
      // A failed save shows in the autosave indicator; the PDF then reflects the last saved version.
    }
    window.location.assign(url);
  };

  // The step in the URL hash is read once mounted (the server render has no hash).
  useEffect(() => {
    const fromHash = window.location.hash.slice(1);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the hash only exists on the client
    if (isEditorStep(fromHash)) setStep(fromHash);
  }, []);

  useEffect(() => {
    if (!focusStep.current) return;
    focusStep.current = false;
    // The new step starts at its top, with its heading focused for keyboard and screen reader users.
    formPanelRef.current?.scrollTo({ top: 0 });
    if (window.scrollY > 0) window.scrollTo({ top: 0 });
    stepHeadingRef.current?.focus({ preventScroll: true });
  }, [step]);

  function goTo(next: EditorStep) {
    if (next === step) return;
    focusStep.current = true;
    setStep(next);
    setTab("form");
    const { pathname, search } = window.location;
    window.history.replaceState(window.history.state, "", next === "details" ? `${pathname}${search}` : `#${next}`);
  }

  const stepIndex = EDITOR_STEPS.indexOf(step);
  const previousStep = stepIndex > 0 ? EDITOR_STEPS[stepIndex - 1] : null;
  const nextStep = stepIndex < EDITOR_STEPS.length - 1 ? EDITOR_STEPS[stepIndex + 1] : null;
  const invalidSteps = useMemo(() => stepsWithErrors(errors), [errors]);

  // One line per earlier step, for the recap above the open one.
  const client = clients.find((option) => option.id === state.clientId);
  const currency = isCurrencyCode(state.currency) ? state.currency : "IDR";
  const recap = {
    details: [
      client?.name ?? t("steps.noClient"),
      state.number.trim(),
      isIsoDate(state.dueDate) ? tAll("invoices.editor.hero.due", { date: formatDocDate(state.dueDate, locale) }) : "",
    ]
      .filter(Boolean)
      .join(" · "),
    items:
      evaluation.keptLineAmounts.length === 0
        ? t("steps.noItems")
        : [
            state.items
              .map((item) => item.name.trim())
              .filter(Boolean)
              .join(", "),
            formatMoney(evaluation.totalMinor, currency, locale),
          ]
            .filter(Boolean)
            .join(" · "),
  };
  const recapRows = EDITOR_STEPS.slice(0, stepIndex)
    .filter((earlier): earlier is "details" | "items" => earlier !== "payment")
    .map((earlier) => ({ step: earlier, summary: recap[earlier] }));

  const section: EditorSectionProps = { state, errors, update };
  const formError = errors._form ? translateValidation(tAll, errors._form) : null;

  return (
    // On wide screens the editor fills the viewport: form on the left and the preview panel on the
    // right scroll on their own, like a workspace; below that the page scrolls and tabs switch panes.
    <div className="flex flex-col xl:h-screen">
      <EditorHeader
        number={state.number}
        status={displayStatus}
        autosave={autosave.status}
        onRetry={autosave.retry}
        actions={
          <>
            {status !== "draft" ? (
              <Link href={`/invoices/${invoiceId}`} className={buttonVariants({ variant: "ghost", size: "sm" })}>
                {t("view")}
              </Link>
            ) : null}
            <a
              href={`/api/invoices/${invoiceId}/pdf`}
              download
              onClick={(event) => void downloadPdf(event)}
              aria-label={t("downloadPdf")}
              className={buttonVariants({ variant: "secondary", size: "sm" })}
            >
              <Download className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("downloadPdf")}</span>
            </a>
            {locked ? null : <SendMenu invoice={{ id: invoiceId, status }} flush={autosave.flush} emailEnabled={emailEnabled} />}
            <EditorMenu
              invoiceId={invoiceId}
              number={state.number}
              status={status}
              hasSchedule={recurringSchedule !== null}
              flush={autosave.flush}
              cancel={autosave.cancel}
            />
          </>
        }
      />

      <div className="sticky top-[120px] z-10 border-b border-border bg-white px-4 py-2 md:top-16 xl:hidden">
        <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 border border-border bg-subtle p-1">
          {(["form", "preview"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`editor-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`editor-panel-${value}`}
              onClick={() => setTab(value)}
              className={cn(
                "h-7 flex-1 text-[13px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                tab === value ? "bg-white text-fg shadow-xs" : "text-muted hover:text-fg",
              )}
            >
              {t(`tabs.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col xl:flex-row">
        <div
          ref={formPanelRef}
          role="tabpanel"
          id="editor-panel-form"
          aria-labelledby="editor-tab-form"
          className={cn("flex min-w-0 flex-1 flex-col xl:flex xl:overflow-y-auto", tab !== "form" && "hidden")}
        >
          <EditorStepper current={step} errors={invalidSteps} onSelect={goTo} />
          <div className="mx-auto w-full max-w-[760px] flex-1 px-4 py-6 md:px-8 md:py-8">
            {recurringSchedule ? (
              <div className="mb-6">
                <ScheduleCard
                  invoiceId={invoiceId}
                  number={state.number}
                  schedule={recurringSchedule}
                  flush={autosave.flush}
                />
              </div>
            ) : null}
            {locked ? <p className="mb-6 rounded-card bg-subtle px-4 py-3 text-sm text-muted">{t("locked")}</p> : null}
            {formError ? (
              <p role="alert" className="mb-6 rounded-card bg-badge-danger-bg px-4 py-3 text-sm text-badge-danger-fg">
                {formError}
              </p>
            ) : null}
            <StepRecap rows={recapRows} onEdit={goTo} />
            <div className="mb-6">
              <p className="text-[13px] text-muted">
                {t("steps.stepOf", { n: stepIndex + 1, total: EDITOR_STEPS.length })}
              </p>
              <h2 ref={stepHeadingRef} tabIndex={-1} className="mt-1 font-serif text-2xl text-fg outline-none">
                {t(`steps.${step}`)}
              </h2>
            </div>
            <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col border-0 p-0">
              {step === "details" ? (
                <>
                  <ClientSection
                    {...section}
                    clients={clients}
                    onClientAdded={(added) => setClients((current) => [...current, added])}
                  />
                  <DetailsSection {...section} />
                </>
              ) : step === "items" ? (
                <>
                  <ItemsSection {...section} evaluation={evaluation} locale={locale} catalog={catalog} />
                  <TotalsSection {...section} evaluation={evaluation} locale={locale} />
                </>
              ) : (
                <>
                  <PaymentSection {...section} accounts={accounts} />
                  <NotesSection {...section} />
                </>
              )}
            </fieldset>
          </div>
          <AmountHero
            state={state}
            evaluation={evaluation}
            locale={locale}
            back={
              previousStep ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => goTo(previousStep)}
                  aria-label={t("steps.backTo", { step: t(`steps.${previousStep}`) })}
                  className="h-9"
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  <span className="hidden sm:inline">{t("steps.back")}</span>
                </Button>
              ) : null
            }
            next={
              nextStep ? (
                <Button type="button" size="sm" onClick={() => goTo(nextStep)} className="h-9">
                  {t("steps.nextTo", { step: t(`steps.${nextStep}`) })}
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              ) : null
            }
          />
        </div>

        <aside
          role="tabpanel"
          id="editor-panel-preview"
          aria-labelledby="editor-tab-preview"
          className={cn(
            "min-w-0 bg-subtle xl:flex xl:w-[46%] xl:max-w-[720px] xl:flex-col xl:border-l xl:border-border",
            tab !== "preview" && "hidden",
          )}
        >
          <AppearanceBar state={state} update={update} disabled={locked} />
          <div className="min-h-0 flex-1 xl:overflow-y-auto">
            <PreviewPane doc={doc} />
          </div>
        </aside>
      </div>
    </div>
  );
}
