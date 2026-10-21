"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { INVOICE_LANGUAGES } from "@/features/profile/schema";
import { isCurrencyCode } from "@/lib/currencies";
import { cn } from "@/lib/utils";
import type { InlineClient } from "@/features/clients/actions";
import type { ClientOption } from "../editor-state";
import { EditorSection, useErrorText, type EditorSectionProps } from "./editor-section";
import { NewClientDialog } from "./new-client-dialog";

function matches(option: ClientOption, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [option.name, option.company, option.email].some((field) => field?.toLowerCase().includes(needle));
}

function ClientCombobox({
  id,
  options,
  value,
  onSelect,
  onCreate,
}: {
  id: string;
  options: ClientOption[];
  value: string | null;
  onSelect: (option: ClientOption | null) => void;
  /** "+ Klien baru": `name` is what was typed in the field. */
  onCreate: (name: string) => void;
}) {
  const t = useTranslations("invoices.editor.client");
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((option) => option.id === value) ?? null;
  // Archived clients are not offered, except the one already on the invoice.
  const visible = useMemo(
    () => options.filter((option) => !option.archived || option.id === value).filter((option) => matches(option, query)),
    [options, value, query],
  );
  // The "+ Klien baru" entry comes after the clients and is reached with the arrow keys as well.
  const lastIndex = visible.length;
  const activeIndex = Math.min(active, lastIndex);

  function choose(option: ClientOption | null) {
    onSelect(option);
    setOpen(false);
    setQuery("");
  }

  function create() {
    const name = query.trim();
    setOpen(false);
    setQuery("");
    onCreate(name);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive(Math.min(activeIndex + 1, lastIndex));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter") {
      // Never submit anything from here; with the list open, Enter picks the highlighted client.
      event.preventDefault();
      if (open) {
        if (activeIndex === lastIndex) create();
        else choose(visible[activeIndex]);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          open ? (activeIndex === lastIndex ? `${listId}-new` : `${listId}-${visible[activeIndex].id}`) : undefined
        }
        autoComplete="off"
        placeholder={selected && !open ? undefined : t("placeholder")}
        value={open ? query : (selected?.name ?? "")}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setQuery("");
          setOpen(true);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
        className={cn("pr-16", !open && selected && "font-medium")}
      />
      <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
        {selected ? (
          <button
            type="button"
            aria-label={t("clear")}
            onClick={() => choose(null)}
            className="inline-flex size-7 items-center justify-center rounded text-muted hover:bg-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
        <ChevronDown aria-hidden className="mr-1.5 size-4 text-muted" />
      </div>

      {open ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={t("label")}
          // Keep the input focused while an option is pressed, so it does not blur and close first.
          onMouseDown={(event) => event.preventDefault()}
          className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-border bg-white p-1 text-sm shadow-md"
        >
          {visible.length === 0 ? (
            <li className="px-2 py-2 text-muted">{options.length === 0 ? t("none") : t("noResults")}</li>
          ) : (
            visible.map((option, index) => (
              <li
                key={option.id}
                id={`${listId}-${option.id}`}
                role="option"
                aria-selected={option.id === value}
                onClick={() => choose(option)}
                onMouseMove={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5",
                  index === activeIndex && "bg-subtle",
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-fg">{option.name}</span>
                  {option.company || option.email ? (
                    <span className="block truncate text-xs text-muted">
                      {[option.company, option.email].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                </span>
                {option.archived ? <span className="text-xs text-muted">{t("archivedTag")}</span> : null}
                {option.id === value ? <Check className="size-4 shrink-0 text-accent" /> : null}
              </li>
            ))
          )}
          <li
            id={`${listId}-new`}
            role="option"
            aria-selected={false}
            onClick={create}
            onMouseMove={() => setActive(lastIndex)}
            className={cn(
              "mt-1 cursor-pointer rounded-sm border-t border-border px-2 py-1.5 font-medium text-accent",
              activeIndex === lastIndex && "bg-subtle",
            )}
          >
            {t("newClient")}
          </li>
        </ul>
      ) : null}
    </div>
  );
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2)).toUpperCase();
}

/** The chosen client as a recipient row: initials avatar, name and contact line. */
function ClientSummary({ client }: { client: ClientOption }) {
  const details = [client.company, client.email, client.address?.split("\n")[0]].filter(Boolean).join(" · ");
  return (
    <div className="flex items-center gap-3 rounded-card bg-subtle px-3 py-2.5">
      <span
        aria-hidden
        className="flex size-11 shrink-0 items-center justify-center rounded-full bg-white text-sm font-extrabold text-accent"
      >
        {initials(client.name)}
      </span>
      <span className="min-w-0">
        <span className="block truncate font-semibold text-fg">{client.name}</span>
        {details ? <span className="block truncate text-xs text-muted">{details}</span> : null}
      </span>
    </div>
  );
}

/**
 * Client picker. Choosing a client also applies the client's default currency and invoice
 * language, when it has them.
 */
export function ClientSection({
  clients,
  state,
  errors,
  update,
  onClientAdded,
}: EditorSectionProps & { clients: ClientOption[]; onClientAdded: (client: ClientOption) => void }) {
  const t = useTranslations("invoices.editor");
  const errorText = useErrorText(errors);
  const selected = clients.find((client) => client.id === state.clientId);
  const [dialog, setDialog] = useState<{ name: string } | null>(null);

  function select(option: ClientOption | null) {
    update((current) => {
      if (!option) return { clientId: null };
      const language = INVOICE_LANGUAGES.find((value) => value === option.defaultLanguage);
      return {
        clientId: option.id,
        currency: option.defaultCurrency && isCurrencyCode(option.defaultCurrency) ? option.defaultCurrency : current.currency,
        language: language ?? current.language,
      };
    });
  }

  /** A client made in the dialog: offered from now on and selected right away. */
  function created(client: InlineClient) {
    const option: ClientOption = {
      id: client.id,
      name: client.name,
      ...(client.company ? { company: client.company } : {}),
      ...(client.email ? { email: client.email } : {}),
      ...(client.phone ? { phone: client.phone } : {}),
      ...(client.address ? { address: client.address } : {}),
      ...(client.country ? { country: client.country } : {}),
      defaultCurrency: client.defaultCurrency,
      defaultLanguage: client.defaultLanguage,
      archived: false,
    };
    onClientAdded(option);
    select(option);
  }

  return (
    <EditorSection title={t("sections.client")}>
      <div className="flex flex-col gap-1.5">
        {/* The section title already says "Klien"; the label is for assistive technology. */}
        <Label htmlFor="invoice-client" className="sr-only">
          {t("client.label")}
        </Label>
        <ClientCombobox
          id="invoice-client"
          options={clients}
          value={state.clientId}
          onSelect={select}
          onCreate={(name) => setDialog({ name })}
        />
        {errorText("clientId") ? <p className="text-xs text-danger">{errorText("clientId")}</p> : null}
      </div>
      {selected ? <ClientSummary client={selected} /> : null}
      {clients.length === 0 ? (
        <p className="-mt-2 text-xs text-muted">
          {t("client.none")}{" "}
          <a href="/clients/new" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            {t("client.add")}
          </a>
        </p>
      ) : null}
      <NewClientDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
        initialName={dialog?.name ?? ""}
        defaults={{ currency: state.currency, language: state.language }}
        onCreated={created}
      />
    </EditorSection>
  );
}
