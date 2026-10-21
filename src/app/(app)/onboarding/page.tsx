import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OnboardingForm } from "@/features/profile/onboarding-form";
import { ensureProfile, getProfile } from "@/features/profile/queries";
import { requireUser } from "@/lib/session";

export default async function OnboardingPage() {
  const user = await requireUser();
  const t = await getTranslations("onboarding");
  await ensureProfile(user.id, { businessName: user.name, email: user.email });
  const profile = await getProfile(user.id);

  return (
    <Card className="mx-auto w-full max-w-[480px]">
      <CardHeader>
        <CardTitle className="text-lg">{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <OnboardingForm businessName={profile.businessName ?? ""} baseCurrency={profile.baseCurrency} />
      </CardContent>
    </Card>
  );
}
