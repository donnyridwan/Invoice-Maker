import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { NextIntlClientProvider } from "next-intl";
import { getPublicInvoice } from "@/features/invoices/queries";
import { recordPublicView } from "@/features/invoices/lifecycle";
import { countInvoicePendingClaims } from "@/features/payment-claims/queries";
import { publicMessages } from "@/features/public-invoice/messages";
import { PublicInvoiceView } from "@/features/public-invoice/public-invoice-view";
import { resolveLocale, TIME_ZONE } from "@/i18n/config";
import { getOptionalUser } from "@/lib/session";

// The metadata and the page both need the invoice; load it once per request.
const loadInvoice = cache(getPublicInvoice);

export async function generateMetadata({ params }: PageProps<"/i/[token]">): Promise<Metadata> {
  const { token } = await params;
  const invoice = await loadInvoice(token);
  if (!invoice) return { robots: { index: false } };
  const business = invoice.businessSnapshot.businessName.trim();
  return {
    title: business ? `Invoice ${invoice.number} — ${business}` : `Invoice ${invoice.number}`,
    robots: { index: false },
  };
}

export default async function PublicInvoicePage({ params }: PageProps<"/i/[token]">) {
  const { token } = await params;
  const invoice = await loadInvoice(token);
  if (!invoice) notFound();

  // Link-preview bots (WhatsApp, Slack, ...) open the link too; they must not count as a view.
  const userAgent = (await headers()).get("user-agent");
  await recordPublicView(token, (await getOptionalUser())?.id ?? null, userAgent);
  const pendingClaims = await countInvoicePendingClaims(invoice.id);
  const language = resolveLocale(invoice.language);

  return (
    // The page speaks the invoice's language, whatever the viewer's UI locale cookie says.
    <NextIntlClientProvider locale={language} messages={publicMessages(language)} timeZone={TIME_ZONE}>
      <PublicInvoiceView invoice={invoice} language={language} pendingClaims={pendingClaims} token={token} />
    </NextIntlClientProvider>
  );
}
