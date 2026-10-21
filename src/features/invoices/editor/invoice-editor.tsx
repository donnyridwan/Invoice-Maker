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
import { AppearanceSection } from "./appearance-section";
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
 * The invoice editor: form on the left, live A4 preview on the right (tabs on small screens).
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
    <div data-theme="wise">
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

      <div className="sticky top-[112px] z-10 -mx-4 border-b border-border bg-white px-4 py-2 md:top-14 md:-mx-6 md:px-6 xl:hidden">
        <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 rounded-button bg-subtle p-1">
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
                "h-8 flex-1 rounded-button text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                tab === value ? "bg-white text-fg shadow-sm" : "text-muted hover:text-fg",
              )}
            >
              {t(`tabs.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-10">
        <div
          role="tabpanel"
          id="editor-panel-form"
          aria-labelledby="editor-tab-form"
          className={cn("min-w-0 xl:block xl:flex-[0_1_520px]", tab !== "form" && "hidden")}
        >
          <fieldset disabled={locked} className="m-0 flex min-w-0 flex-col gap-4 border-0 p-0">
            {locked ? <p className="rounded-md bg-subtle px-3 py-2 text-sm text-muted">{t("locked")}</p> : null}
            {formError ? (
              <p role="alert" className="rounded-md bg-badge-danger-bg px-3 py-2 text-sm text-badge-danger-fg">
                {formError}
              </p>
            ) : null}
            <AmountHero state={state} evaluation={evaluation} locale={locale} />
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
            <AppearanceSection {...section} doc={doc} />
          </fieldset>
          {recurringSchedule ? (
            <div className="mt-4">
              <ScheduleCard
                invoiceId={invoiceId}
                number={state.number}
                schedule={recurringSchedule}
                flush={autosave.flush}
              />
            </div>
          ) : null}
        </div>

        <div
          role="tabpanel"
          id="editor-panel-preview"
          aria-labelledby="editor-tab-preview"
          className={cn(
            "min-w-0 xl:block xl:min-w-[440px] xl:flex-[1_1_0] xl:sticky xl:top-[72px] xl:max-h-[calc(100vh-88px)] xl:overflow-y-auto",
            tab !== "preview" && "hidden",
          )}
        >
          <PreviewPane doc={doc} />
        </div>
      </div>
    </div>
  );
}
