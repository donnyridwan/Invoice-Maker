import { Download } from "lucide-react";
import { createTranslator } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildInvoiceDocument, paymentAccountLines } from "@/documents/build-document";
import { DOC_LABELS } from "@/documents/dictionary";
import { InvoiceDocumentView } from "@/documents/invoice-document-view";
import { ScaledDocument } from "@/documents/scaled-document";
import { displayStatus, dueRelative } from "@/features/invoices/display-status";
import { documentSourceFromInvoice } from "@/features/invoices/document-source";
import type { InvoiceWithItems } from "@/features/invoices/queries";
import { MAX_PENDING_CLAIMS } from "@/features/payment-claims/schema";
import type { PaymentAccount } from "@/features/payment-accounts/queries";
import { summarizePaymentAccount } from "@/features/payment-accounts/summary";
import type { Locale } from "@/i18n/config";
import { isCurrencyCode } from "@/lib/currencies";
import { addDays, formatDocDate, todayInJakarta } from "@/lib/dates";
import { formatMoney, formatMoneyInput } from "@/lib/money";
import { publicMessages } from "./messages";
import { ClaimDialog } from "./claim-dialog";
import { PaymentMethodsCard, type PaymentMethod } from "./payment-methods-card";
import { StatusBanner } from "./status-banner";

const COPYABLE_KEYS = new Set(["accountNumber", "iban", "email"]);

type Props = {
  invoice: InvoiceWithItems;
  language: Locale;
  pendingClaims: number;
  token: string;
};

/** The client-facing page of an invoice: banner, the document, how to pay and a quiet footer. */
export function PublicInvoiceView({ invoice, language, pendingClaims, token }: Props) {
  // Not `getTranslations({ locale })`: that formats for `language` but still reads the messages of
  // the viewer's UI locale. The invoice's own language must pick the messages too.
  const t = createTranslator({ locale: language, messages: publicMessages(language), namespace: "public" });
  const today = todayInJakarta();
  const business = invoice.businessSnapshot.businessName.trim() || t("unnamedBusiness");
  const currency = isCurrencyCode(invoice.currency) ? invoice.currency : "IDR";

  if (invoice.status === "void") {
    return (
      <PublicShell footer={t("footer")} language={language}>
        <Card className="flex flex-col gap-2 rounded-lg p-6 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight text-fg">{t("void.title")}</h1>
          <p className="text-sm text-muted">{t("void.description", { business, number: invoice.number })}</p>
        </Card>
      </PublicShell>
    );
  }

  // A client who just reported a payment must see "awaiting confirmation" even if it is overdue.
  const status =
    invoice.status === "paid"
      ? "paid"
      : invoice.status === "payment_claimed"
        ? "awaiting"
        : displayStatus(invoice, today) === "overdue"
          ? "overdue"
          : "unpaid";
  const badgeVariant = { paid: "success", awaiting: "warning", overdue: "danger", unpaid: "info" } as const;

  let subtitle: string | null;
  if (status === "paid") {
    subtitle = invoice.paidAt ? t("paidOn", { date: formatDocDate(todayInJakarta(invoice.paidAt), language) }) : null;
  } else {
    const due =
      invoice.dueDate === invoice.issueDate
        ? t("dueOnReceipt")
        : t("dueOn", { date: formatDocDate(invoice.dueDate, language) });
    const relative = dueRelative(invoice.dueDate, today);
    const when =
      relative.kind === "today"
        ? t("dueToday")
        : relative.kind === "inDays"
          ? t("dueInDays", { days: relative.days })
          : t("overdueDays", { days: relative.days });
    subtitle = invoice.dueDate === invoice.issueDate ? due : `${due} · ${when}`;
  }

  const total = formatMoney(invoice.totalMinor, currency, language);
  const title =
    status === "paid" ? t("paidTitle", { number: invoice.number }) : t("requestTitle", { business, total });

  const labels = DOC_LABELS[language];
  const methods: PaymentMethod[] = invoice.paymentAccountsSnapshot.map((account) => {
    const title = summarizePaymentAccount({ ...account, type: account.type as PaymentAccount["type"] }).title;
    return {
      title,
      lines: paymentAccountLines(account, labels)
        // The bank name is already the card title.
        .filter((line) => !(line.key === "bankName" && line.value === title))
        .map((line) => ({ ...line, copyable: COPYABLE_KEYS.has(line.key) })),
    };
  });

  const canClaim = status !== "paid";

  return (
    <PublicShell footer={t("footer")} language={language}>
      <StatusBanner
        logoUrl={invoice.businessSnapshot.logoUrl}
        badge={{ label: t(`status.${status}`), variant: badgeVariant[status] }}
        title={title}
        subtitle={subtitle}
        note={status === "awaiting" ? t("awaitingNote", { business }) : null}
        actions={
          <>
            {canClaim ? (
              <ClaimDialog
                token={token}
                business={business}
                defaultAmount={formatMoneyInput(invoice.totalMinor, currency, language)}
                today={today}
                maxDate={addDays(today, 1)}
                limitReached={pendingClaims >= MAX_PENDING_CLAIMS}
              />
            ) : null}
            <Button asChild variant="secondary">
              <a href={`/i/${token}/pdf`} download>
                <Download className="size-4" aria-hidden />
                {t("downloadPdf")}
              </a>
            </Button>
          </>
        }
      />
      <Card role="region" className="rounded-lg p-3 shadow-sm sm:p-5" aria-label={t("documentLabel", { number: invoice.number })}>
        <ScaledDocument>
          <InvoiceDocumentView doc={buildInvoiceDocument(documentSourceFromInvoice(invoice))} />
        </ScaledDocument>
      </Card>
      <PaymentMethodsCard methods={methods} business={business} />
    </PublicShell>
  );
}

function PublicShell({
  children,
  footer,
  language,
}: {
  children: React.ReactNode;
  footer: string;
  language: Locale;
}) {
  return (
    <div lang={language} className="min-h-screen bg-subtle">
      <main className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-6 sm:py-10">{children}</main>
      <footer className="px-4 pb-8 text-center text-xs text-muted">{footer}</footer>
    </div>
  );
}
