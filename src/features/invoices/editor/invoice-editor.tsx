"use client";

import { useDeferredValue, useMemo, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { buildInvoiceDocument } from "@/documents/build-document";
import { resolveLocale } from "@/i18n/config";
import { translateValidation } from "@/lib/validation-message";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
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
import type { EditorSectionProps } from "./editor-section";
import { ItemsSection } from "./items-section";
import { NotesSection } from "./notes-section";
import { PaymentSection } from "./payment-section";
import { PreviewPane } from "./preview-pane";
import { TotalsSection } from "./totals-section";

type Tab = "form" | "preview";

/**
 * The invoice editor: form on the left, a preview panel with the live A4 document on the right (tabs
 * on small screens).
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

      <div className="sticky top-24 z-10 border-b border-border bg-white px-4 py-2 md:top-12 xl:hidden">
        <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 rounded-lg bg-subtle p-1">
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
                "h-7 flex-1 rounded-md text-[13px] font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
          role="tabpanel"
          id="editor-panel-form"
          aria-labelledby="editor-tab-form"
          className={cn("flex min-w-0 flex-1 flex-col xl:flex xl:overflow-y-auto", tab !== "form" && "hidden")}
        >
          <div className="mx-auto w-full max-w-[680px] flex-1 px-4 py-6 md:px-8 md:py-8">
            <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col border-0 p-0">
              {locked ? <p className="mb-6 rounded-card bg-subtle px-4 py-3 text-sm text-muted">{t("locked")}</p> : null}
              {formError ? (
                <p role="alert" className="mb-6 rounded-card bg-badge-danger-bg px-4 py-3 text-sm text-badge-danger-fg">
                  {formError}
                </p>
              ) : null}
              <ClientSection
                {...section}
                clients={clients}
                onClientAdded={(client) => setClients((current) => [...current, client])}
              />
              <DetailsSection {...section} />
              <ItemsSection {...section} evaluation={evaluation} locale={locale} catalog={catalog} />
              <TotalsSection {...section} evaluation={evaluation} locale={locale} />
              <PaymentSection {...section} accounts={accounts} />
              <NotesSection {...section} />
            </fieldset>
            {recurringSchedule ? (
              <div className="mt-2">
                <ScheduleCard
                  invoiceId={invoiceId}
                  number={state.number}
                  schedule={recurringSchedule}
                  flush={autosave.flush}
                />
              </div>
            ) : null}
          </div>
          <AmountHero state={state} evaluation={evaluation} locale={locale} />
        </div>

        <aside
          role="tabpanel"
          id="editor-panel-preview"
          aria-labelledby="editor-tab-preview"
          className={cn(
            "min-w-0 bg-sidebar xl:flex xl:w-[46%] xl:max-w-[720px] xl:flex-col xl:border-l xl:border-border",
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
