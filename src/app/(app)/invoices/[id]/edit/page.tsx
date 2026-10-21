import { notFound } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getClient, listClients, type Client } from "@/features/clients/queries";
import { editorStateFromInvoice, type AccountOption, type ClientOption } from "@/features/invoices/editor-state";
import { InvoiceEditor } from "@/features/invoices/editor/invoice-editor";
import { getInvoice } from "@/features/invoices/queries";
import {
  businessSnapshotFrom,
  clientSnapshotFrom,
  paymentAccountSnapshotFrom,
} from "@/features/invoices/snapshots";
import { listPaymentAccounts } from "@/features/payment-accounts/queries";
import { summarizePaymentAccount } from "@/features/payment-accounts/summary";
import { getProfile } from "@/features/profile/queries";
import { resolveLocale } from "@/i18n/config";
import { NotFoundError } from "@/lib/errors";
import { requireUser } from "@/lib/session";

function toClientOption(client: Client): ClientOption {
  return {
    id: client.id,
    ...clientSnapshotFrom(client),
    defaultCurrency: client.defaultCurrency,
    defaultLanguage: client.defaultLanguage,
    archived: Boolean(client.archivedAt),
  };
}

export default async function EditInvoicePage({ params }: PageProps<"/invoices/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;
  const locale = resolveLocale(await getLocale());

  const invoice = await getInvoice(user.id, id).catch((error) => {
    if (error instanceof NotFoundError) notFound();
    throw error;
  });

  const [profile, activeClients, allAccounts] = await Promise.all([
    getProfile(user.id),
    listClients(user.id),
    listPaymentAccounts(user.id, { includeArchived: true }),
  ]);

  // The invoice's own client stays selectable even after it was archived.
  const clients = activeClients.map(toClientOption);
  if (invoice.clientId && !clients.some((client) => client.id === invoice.clientId)) {
    const own = await getClient(user.id, invoice.clientId).catch(() => null);
    if (own) clients.push(toClientOption(own));
  }

  const initial = editorStateFromInvoice(invoice, locale);
  const selected = new Set(initial.paymentAccountIds);
  const accounts: AccountOption[] = allAccounts
    .filter((account) => !account.archivedAt || selected.has(account.id))
    .map((account) => ({
      snapshot: paymentAccountSnapshotFrom(account),
      ...summarizePaymentAccount(account),
      isDefault: account.isDefault,
      archived: Boolean(account.archivedAt),
    }));

  return (
    // Keyed by locale: the typed numbers are formatted for the UI language, so a language switch
    // starts the form over from the saved invoice.
    <InvoiceEditor
      key={locale}
      invoiceId={invoice.id}
      status={invoice.status}
      initial={initial}
      business={businessSnapshotFrom(profile)}
      clients={clients}
      accounts={accounts}
    />
  );
}
