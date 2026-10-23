import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/app-shell/locale-switcher";

export default async function AuthLayout({ children }: LayoutProps<"/">) {
  const t = await getTranslations("common");
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center bg-sidebar px-4 py-12">
      <div className="absolute right-4 top-4">
        <LocaleSwitcher />
      </div>
      <div className="w-full max-w-[400px]">
        <p className="mb-8 flex items-center justify-center gap-2.5">
          <span aria-hidden className="flex size-8 items-center justify-center rounded-lg bg-fg text-xs font-bold text-white">
            IM
          </span>
          <span data-slot="wordmark" className="text-xl">
            {t("appName")}
          </span>
        </p>
        {children}
      </div>
    </main>
  );
}
