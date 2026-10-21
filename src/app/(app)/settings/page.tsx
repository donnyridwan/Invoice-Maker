import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { AccountCard } from "@/features/profile/account-card";
import { InvoiceDefaultsForm } from "@/features/profile/invoice-defaults-form";
import { ProfileForm } from "@/features/profile/profile-form";
import { getProfile } from "@/features/profile/queries";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const profile = await getProfile(user.id);

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <div className="flex max-w-3xl flex-col gap-6">
        <ProfileForm profile={profile} />
        <InvoiceDefaultsForm profile={profile} />
        <AccountCard />
      </div>
    </>
  );
}
