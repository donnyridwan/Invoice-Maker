"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { buildInvoiceDocument } from "@/documents/build-document";
import { resolveLocale } from "@/i18n/config";
import { translateValidation } from "@/lib/validation-message";
import { cn } from "@/lib/utils";
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
import type { Invoice } from "../queries";
import { AppearanceSection } from "./appearance-section";
import { ClientSection } from "./client-section";
import { DetailsSection } from "./details-section";
import { EditorHeader } from "./editor-header";
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
  initial,
  business,
  clients: initialClients,
  accounts,
  catalog,
}: {
  invoiceId: string;
  status: Invoice["status"];
  initial: EditorState;
  business: BusinessSnapshot;
  clients: ClientOption[];
  accounts: AccountOption[];
  catalog: CatalogOption[];
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

  const section: EditorSectionProps = { state, errors, update };
  const formError = errors._form ? translateValidation(tAll, errors._form) : null;

  return (
    <div>
      <EditorHeader
        number={state.number}
        status={status}
        autosave={autosave.status}
        onRetry={autosave.retry}
        actions={
          <EditorMenu
            invoiceId={invoiceId}
            number={state.number}
            status={status}
            flush={autosave.flush}
            cancel={autosave.cancel}
          />
        }
      />

      <div className="sticky top-[112px] z-10 -mx-4 border-b border-border bg-white px-4 py-2 md:top-14 md:-mx-6 md:px-6 xl:hidden">
        <div role="tablist" aria-label={t("tabs.label")} className="flex gap-1 rounded-md border border-border bg-white p-0.5">
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
                "h-8 flex-1 rounded text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                tab === value ? "bg-subtle text-fg" : "text-muted hover:text-fg",
              )}
            >
              {t(`tabs.${value}`)}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-6 xl:flex-row xl:items-start xl:gap-8">
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
