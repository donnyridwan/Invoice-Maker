import type { Metadata } from "next";
import { Geist, Hedvig_Letters_Serif } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";
import { Toaster } from "@/components/ui/sonner";
import { TIME_ZONE } from "@/i18n/config";
import "./globals.css";

const sans = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

// Headlines and the big figures are set in a serif, Midday-style.
const serif = Hedvig_Letters_Serif({
  variable: "--font-hedvig-serif",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${sans.variable} ${serif.variable}`}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={TIME_ZONE}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
