import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { PaymentAccountList } from "@/features/payment-accounts/payment-account-list";
import { listPaymentAccounts } from "@/features/payment-accounts/queries";
import { requireUser } from "@/lib/session";

export default async function PaymentAccountsPage() {
  const user = await requireUser();
  const t = await getTranslations();
  const accounts = await listPaymentAccounts(user.id, { includeArchived: true });

  return (
    <>
      <Link
        href="/settings"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted hover:text-fg"
      >
        <ChevronLeft className="size-4" />
        {t("nav.settings")}
      </Link>
      <PageHeader title={t("paymentAccounts.title")} description={t("paymentAccounts.description")} />
      <PaymentAccountList accounts={accounts} />
    </>
  );
}
