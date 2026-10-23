import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/ui/page-header";
import { AccountCard } from "@/features/profile/account-card";
import { LogoUpload } from "@/features/profile/logo-upload";
import { InvoiceDefaultsForm } from "@/features/profile/invoice-defaults-form";
import { VerifyEmailCard } from "@/features/profile/verify-email-card";
import { ProfileForm } from "@/features/profile/profile-form";
import { getProfile } from "@/features/profile/queries";
import { isEmailEnabled } from "@/lib/email";
import { requireUser } from "@/lib/session";

export default async function SettingsPage() {
  const user = await requireUser();
  const t = await getTranslations("settings");
  const profile = await getProfile(user.id);

  const sections = [
    { id: "profile", label: t("businessProfile"), content: <ProfileForm profile={profile} /> },
    { id: "logo", label: t("logo"), content: <LogoUpload logoUrl={profile.logoUrl} /> },
    { id: "invoice-defaults", label: t("invoiceDefaults"), content: <InvoiceDefaultsForm profile={profile} /> },
    {
      id: "email",
      label: t("verifyEmail.title"),
      content: <VerifyEmailCard email={user.email} verified={user.emailVerified} emailEnabled={isEmailEnabled()} />,
    },
    { id: "account", label: t("account"), content: <AccountCard /> },
  ];

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      {/* Section links as text tabs, Midday-style; the page itself stays one scrollable form. */}
      <nav aria-label={t("title")} className="mb-8 flex gap-5 overflow-x-auto border-b border-border">
        {sections.map((section) => (
          <a
            key={section.id}
            href={`#${section.id}`}
            className="-mb-px whitespace-nowrap border-b border-transparent pb-2.5 text-sm text-muted hover:border-fg hover:text-fg"
          >
            {section.label}
          </a>
        ))}
      </nav>
      <div className="flex max-w-2xl flex-col gap-6">
        {sections.map((section) => (
          <div key={section.id} id={section.id} className="scroll-mt-24">
            {section.content}
          </div>
        ))}
      </div>
    </>
  );
}
