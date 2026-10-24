import type { Metadata } from "next";
import { Archivo, Geist, Hedvig_Letters_Serif, Inter, Young_Serif } from "next/font/google";
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

// The invoice templates are set in Inter, with Archivo and Young Serif for a few headings. Not
// preloaded: only the pages that show a document use them.
const docSans = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const docDisplay = Archivo({ variable: "--font-archivo", subsets: ["latin"], preload: false });
const docSerif = Young_Serif({ variable: "--font-young-serif", subsets: ["latin"], weight: "400", preload: false });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("meta");
  return { title: t("title"), description: t("description") };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      className={`${sans.variable} ${serif.variable} ${docSans.variable} ${docDisplay.variable} ${docSerif.variable}`}
    >
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={TIME_ZONE}>
          {children}
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
