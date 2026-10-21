// Pure model of the invoice editor: the form state (everything is a string the user typed or an
// enum), its conversion to the draft payload the server accepts, and the preview source. No React,
// no DB, so it is unit-testable and the same code serves the live preview and autosave.

import type { InvoiceDocumentSource } from "@/documents/types";
import { INVOICE_LANGUAGES, TEMPLATES, type InvoiceLanguage, type Template } from "@/features/profile/schema";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currencies";
import { isIsoDate, todayInJakarta } from "@/lib/dates";
import { calcTotals, type DiscountType } from "@/lib/invoice-calc";
import { formatMoneyInput, parseMoneyInput } from "@/lib/money";
import { formatQuantity, parseQuantityInput } from "@/lib/quantity";
import type { InvoiceWithItems } from "./queries";
import { invoiceDraftSchema, MAX_PERCENT_BP, type InvoiceDraftInput } from "./schema";
import type { BusinessSnapshot, ClientSnapshot, PaymentAccountSnapshot } from "./snapshots";

export type EditorItem = {
  /** Stable React key (the stored item id, or a generated one for rows added in the editor). */
  key: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
};

export type EditorState = {
  clientId: string | null;
  number: string;
  issueDate: string;
  dueDate: string;
  currency: string;
  language: InvoiceLanguage;
  template: Template;
  accentColor: string;
  discountType: DiscountType;
  /** Typed discount: a percentage ("12,5") or an amount, depending on `discountType`. */
  discountValue: string;
  notes: string;
  paymentAccountIds: string[];
  items: EditorItem[];
};

export type ClientSnapshotWithId = ClientSnapshot & { id: string };

/** A client the editor can pick, with the defaults it fills in. */
export type ClientOption = ClientSnapshotWithId & {
  defaultCurrency: string | null;
  defaultLanguage: string | null;
  archived: boolean;
};

/** A payment account the editor can tick: its frozen snapshot plus how to describe it. */
export type AccountOption = {
  snapshot: PaymentAccountSnapshot;
  title: string;
  subtitle: string;
  isDefault: boolean;
  archived: boolean;
};

/** An active catalog item the item-name autocomplete can offer. */
export type CatalogOption = {
  id: string;
  name: string;
  description: string | null;
  unit: string | null;
  unitPriceMinor: number;
  currency: string;
};

export const MAX_CATALOG_SUGGESTIONS = 8;

/**
 * Catalog items whose name contains `query` (case-insensitive), names that start with it first,
 * at most `MAX_CATALOG_SUGGESTIONS`. An empty query offers nothing.
 */
export function filterCatalogOptions(options: CatalogOption[], query: string): CatalogOption[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const hits = options.filter((option) => option.name.toLowerCase().includes(needle));
  const starts = (option: CatalogOption) => (option.name.toLowerCase().startsWith(needle) ? 0 : 1);
  // Array.prototype.sort is stable, so the catalog's own (alphabetical) order holds within a group.
  return hits.sort((a, b) => starts(a) - starts(b)).slice(0, MAX_CATALOG_SUGGESTIONS);
}

/**
 * What picking a catalog item changes on a row. The price is only taken over when the catalog
 * item is in the invoice's currency; otherwise `priceCurrency` names the catalog currency so the
 * UI can say so, and the price is left as it was.
 */
export function applyCatalogItem(
  option: CatalogOption,
  invoiceCurrency: string,
  locale: Locale,
): { patch: Partial<EditorItem>; priceCurrency: string | null } {
  const patch: Partial<EditorItem> = {
    name: option.name,
    description: option.description ?? "",
    unit: option.unit ?? "",
  };
  if (option.currency === invoiceCurrency && isCurrencyCode(option.currency)) {
    patch.unitPrice = formatMoneyInput(option.unitPriceMinor, option.currency, locale);
    return { patch, priceCurrency: null };
  }
  return { patch, priceCurrency: option.currency };
}

/** Message-key errors keyed by field: `number`, `dueDate`, `items.<row>.unitPrice`, `_form`, ... */
export type EditorErrors = Record<string, string>;

/** What a new row starts with. A row that still looks like this counts as empty. */
const DEFAULT_QUANTITY = "1";

export function newEditorItem(key: string = crypto.randomUUID()): EditorItem {
  return { key, name: "", description: "", quantity: DEFAULT_QUANTITY, unit: "", unitPrice: "" };
}

/** A row the user has not filled in: it is not saved and not shown on the document. */
export function isBlankItem(item: EditorItem): boolean {
  const quantity = item.quantity.trim();
  return (
    item.name.trim() === "" &&
    item.description.trim() === "" &&
    item.unit.trim() === "" &&
    item.unitPrice.trim() === "" &&
    (quantity === "" || quantity === DEFAULT_QUANTITY)
  );
}

/** Indexes (in `state.items`) of the rows that are saved. */
export function keptItemIndexes(items: EditorItem[]): number[] {
  return items.flatMap((item, index) => (isBlankItem(item) ? [] : [index]));
}

function currencyOf(value: string): CurrencyCode | null {
  return isCurrencyCode(value) ? value : null;
}

function oneOf<T extends string>(values: readonly T[], value: string, fallback: T): T {
  return (values as readonly string[]).includes(value) ? (value as T) : fallback;
}

/** Basis points <-> the typed percentage: 1250 <-> "12,5". */
function formatPercent(basisPoints: number, locale: Locale): string {
  return formatQuantity(basisPoints * 10, locale);
}

function parsePercent(text: string, locale: Locale): number | null {
  // A percentage has two decimals, exactly like a two-decimal currency has cents.
  return parseMoneyInput(text, "USD", locale);
}

export function editorStateFromInvoice(inv: InvoiceWithItems, locale: Locale): EditorState {
  const currency = currencyOf(inv.currency) ?? "IDR";
  const discountType = oneOf<DiscountType>(["none", "percent", "fixed"], inv.discountType, "none");

  let discountValue = "";
  if (discountType === "percent") discountValue = formatPercent(inv.discountValue, locale);
  else if (discountType === "fixed") discountValue = formatMoneyInput(inv.discountValue, currency, locale);

  const items: EditorItem[] =
    inv.items.length > 0
      ? inv.items.map((item) => ({
          key: item.id,
          name: item.name,
          description: item.description ?? "",
          quantity: formatQuantity(item.quantityMilli, locale),
          unit: item.unit ?? "",
          unitPrice: formatMoneyInput(item.unitPriceMinor, currency, locale),
        }))
      : [newEditorItem("new-0")];

  return {
    clientId: inv.clientId,
    number: inv.number,
    issueDate: inv.issueDate,
    dueDate: inv.dueDate,
    currency: inv.currency,
    language: oneOf(INVOICE_LANGUAGES, inv.language, "id"),
    template: oneOf(TEMPLATES, inv.template, "minimal"),
    accentColor: inv.accentColor,
    discountType,
    discountValue,
    notes: inv.notes ?? "",
    paymentAccountIds: inv.paymentAccountsSnapshot.map((account) => account.id),
    items,
  };
}

const ITEM_FIELD_RENAMES: Record<string, string> = { quantityMilli: "quantity", unitPriceMinor: "unitPrice" };

/**
 * Re-keys errors that refer to a row of the saved payload (`items.<k>.<field>`, blank rows
 * removed) so they point at the row's position in the editor, and uses the editor's field names.
 */
function rekeyItemPath(path: string, kept: number[]): string {
  const match = /^items\.(\d+)\.(.+)$/.exec(path);
  if (!match) return path;
  const row = kept[Number(match[1])] ?? Number(match[1]);
  return `items.${row}.${ITEM_FIELD_RENAMES[match[2]] ?? match[2]}`;
}

/** Server `fieldErrors` (first message per field) in the editor's keys. */
export function mapServerErrors(state: EditorState, fieldErrors: Record<string, string[]>): EditorErrors {
  const kept = keptItemIndexes(state.items);
  const errors: EditorErrors = {};
  for (const [path, messages] of Object.entries(fieldErrors)) {
    const key = rekeyItemPath(path, kept);
    if (messages[0] && !(key in errors)) errors[key] = messages[0];
  }
  return errors;
}

type Discount = { type: DiscountType; value: number };

/** Typed discount to the stored unit; null when it cannot be read. */
function parseDiscount(state: EditorState, currency: CurrencyCode | null, locale: Locale): number | null {
  if (state.discountType === "none") return 0;
  const text = state.discountValue.trim();
  if (text === "") return 0;
  if (state.discountType === "percent") return parsePercent(text, locale);
  return currency ? parseMoneyInput(text, currency, locale) : null;
}

/**
 * The editor's draft payload, or the errors that block saving. Rows that are entirely empty are
 * dropped. Error keys use the row's position in `state.items`.
 */
export function toDraftInput(
  state: EditorState,
  locale: Locale,
): { ok: true; input: InvoiceDraftInput } | { ok: false; errors: EditorErrors } {
  const errors: EditorErrors = {};
  const currency = currencyOf(state.currency);
  const kept = keptItemIndexes(state.items);

  const items = kept.map((index) => {
    const row = state.items[index];
    const quantity = parseQuantityInput(row.quantity, locale);
    if (quantity === null) errors[`items.${index}.quantity`] = row.quantity.trim() === "" ? "required" : "invalidNumber";

    const priceText = row.unitPrice.trim();
    const price = priceText === "" ? 0 : currency ? parseMoneyInput(priceText, currency, locale) : null;
    if (price === null) errors[`items.${index}.unitPrice`] = "invalidAmount";

    return {
      name: row.name,
      description: row.description,
      // Placeholders for an unreadable value; the error above already blocks saving.
      quantityMilli: quantity ?? 1000,
      unit: row.unit,
      unitPriceMinor: price ?? 0,
    };
  });

  const discount = parseDiscount(state, currency, locale);
  if (discount === null) errors.discountValue = state.discountType === "percent" ? "invalidNumber" : "invalidAmount";
  if (state.number.trim() === "") errors.number = "required";

  const candidate = {
    clientId: state.clientId,
    number: state.number,
    issueDate: state.issueDate,
    dueDate: state.dueDate,
    currency: state.currency,
    language: state.language,
    template: state.template,
    accentColor: state.accentColor,
    discountType: state.discountType,
    discountValue: state.discountType === "none" ? 0 : (discount ?? 0),
    notes: state.notes,
    paymentAccountIds: state.paymentAccountIds,
    items,
  };

  const parsed = invoiceDraftSchema.safeParse(candidate);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.length > 0 ? rekeyItemPath(issue.path.join("."), kept) : "_form";
      if (!(key in errors)) errors[key] = issue.message;
    }
  } else if (Object.keys(errors).length === 0) {
    try {
      calcTotals(parsed.data.items, { type: parsed.data.discountType, value: parsed.data.discountValue });
    } catch {
      errors._form = "amountTooLarge";
    }
  }

  if (Object.keys(errors).length > 0 || !parsed.success) return { ok: false, errors };
  return { ok: true, input: parsed.data };
}

export type EditorItemEvaluation = {
  quantityMilli: number | null;
  unitPriceMinor: number | null;
  /** Line amount, or null when the quantity or price cannot be read (or the amount is too large). */
  amountMinor: number | null;
};

export type EditorEvaluation = {
  /** One entry per row of `state.items`. */
  rows: EditorItemEvaluation[];
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  /** Line amounts of the rows that make it into the document, in order. */
  keptLineAmounts: number[];
};

/**
 * Line amounts and totals as shown while typing. Anything that cannot be read counts as 0, so the
 * preview and totals keep working with a half-typed form.
 */
export function evaluateEditor(state: EditorState, locale: Locale): EditorEvaluation {
  const currency = currencyOf(state.currency);

  const parsedRows = state.items.map((row) => {
    const quantityMilli = parseQuantityInput(row.quantity, locale);
    const priceText = row.unitPrice.trim();
    const unitPriceMinor = priceText === "" ? 0 : currency ? parseMoneyInput(priceText, currency, locale) : null;
    return { quantityMilli, unitPriceMinor };
  });

  const kept = keptItemIndexes(state.items);
  const lines = kept.map((index) => ({
    quantityMilli: parsedRows[index].quantityMilli ?? 0,
    unitPriceMinor: parsedRows[index].unitPriceMinor ?? 0,
  }));

  const typedDiscount = parseDiscount(state, currency, locale) ?? 0;
  const discount: Discount = {
    type: state.discountType,
    value: state.discountType === "percent" ? Math.min(typedDiscount, MAX_PERCENT_BP) : typedDiscount,
  };

  let totals: ReturnType<typeof calcTotals>;
  try {
    totals = calcTotals(lines, discount);
  } catch {
    totals = { lineAmounts: lines.map(() => 0), subtotalMinor: 0, discountMinor: 0, totalMinor: 0 };
  }

  const rows = parsedRows.map((row, index): EditorItemEvaluation => {
    const position = kept.indexOf(index);
    const readable = row.quantityMilli !== null && row.unitPriceMinor !== null;
    return {
      ...row,
      amountMinor: readable && position >= 0 ? totals.lineAmounts[position] : readable ? 0 : null,
    };
  });

  return {
    rows,
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    totalMinor: totals.totalMinor,
    keptLineAmounts: totals.lineAmounts,
  };
}

export type PreviewContext = {
  business: BusinessSnapshot;
  clients: ClientSnapshotWithId[];
  /** Every account that can be ticked (the preview shows the selected ones, in selection order). */
  accounts: PaymentAccountSnapshot[];
  status: string;
};

function validDate(value: string, fallback: string): string {
  return isIsoDate(value) ? value : fallback;
}

export function toPreviewSource(state: EditorState, ctx: PreviewContext, locale: Locale): InvoiceDocumentSource {
  const evaluation = evaluateEditor(state, locale);
  const kept = keptItemIndexes(state.items);
  const currency = currencyOf(state.currency);

  const found = state.clientId ? ctx.clients.find((client) => client.id === state.clientId) : undefined;
  const client: ClientSnapshot | null = found
    ? {
        name: found.name,
        ...(found.company ? { company: found.company } : {}),
        ...(found.email ? { email: found.email } : {}),
        ...(found.phone ? { phone: found.phone } : {}),
        ...(found.address ? { address: found.address } : {}),
        ...(found.country ? { country: found.country } : {}),
      }
    : null;

  const today = todayInJakarta();
  const issueDate = validDate(state.issueDate, validDate(state.dueDate, today));
  const dueDate = validDate(state.dueDate, issueDate);

  const typedDiscount = parseDiscount(state, currency, locale) ?? 0;

  return {
    number: state.number,
    status: ctx.status,
    language: state.language,
    template: state.template,
    accentColor: state.accentColor,
    currency: state.currency,
    issueDate,
    dueDate,
    business: ctx.business,
    client,
    paymentAccounts: state.paymentAccountIds.flatMap((id) => ctx.accounts.filter((account) => account.id === id)),
    items: kept.map((index, position) => ({
      name: state.items[index].name,
      description: state.items[index].description,
      quantityMilli: evaluation.rows[index].quantityMilli ?? 0,
      unit: state.items[index].unit,
      unitPriceMinor: evaluation.rows[index].unitPriceMinor ?? 0,
      amountMinor: evaluation.keptLineAmounts[position] ?? 0,
    })),
    subtotalMinor: evaluation.subtotalMinor,
    discountType: state.discountType,
    discountValue: state.discountType === "percent" ? Math.min(typedDiscount, MAX_PERCENT_BP) : typedDiscount,
    discountMinor: evaluation.discountMinor,
    totalMinor: evaluation.totalMinor,
    notes: state.notes,
  };
}
