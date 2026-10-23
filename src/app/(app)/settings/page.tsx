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
      <div className="flex gap-10">
        {/* Section links, like a settings sidebar; the page itself stays one scrollable form. */}
        <nav aria-label={t("title")} className="sticky top-20 hidden h-fit w-44 shrink-0 lg:block">
          <ul className="flex flex-col border-l border-border">
            {sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="-ml-px block border-l border-transparent py-1.5 pl-3 text-[13px] text-muted hover:border-fg hover:text-fg"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex min-w-0 max-w-3xl flex-1 flex-col gap-6">
          {sections.map((section) => (
            <div key={section.id} id={section.id} className="scroll-mt-16">
              {section.content}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
