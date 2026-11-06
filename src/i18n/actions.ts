"use server";

import { cookies } from "next/headers";
import { getUiLocale, updateUiLocale } from "@/features/profile/queries";
import { getOptionalUser } from "@/lib/session";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./config";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export async function setLocale(locale: Locale): Promise<void> {
  const resolved = resolveLocale(locale);
  const store = await cookies();
  store.set(LOCALE_COOKIE, resolved, {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
  });

  // Signed-in users also keep the choice on their account.
  const user = await getOptionalUser();
  if (user) await updateUiLocale(user.id, resolved);
}

/**
 * After signing in on a browser without a language cookie, adopts the language saved on the
 * account so the UI matches the one the user picked on another device.
 */
export async function syncLocaleFromProfile(): Promise<void> {
  const store = await cookies();
  if (store.get(LOCALE_COOKIE)) return;
  const user = await getOptionalUser();
  if (!user) return;
  const uiLocale = await getUiLocale(user.id);
  if (!uiLocale) return;
  store.set(LOCALE_COOKIE, resolveLocale(uiLocale), {
    maxAge: ONE_YEAR_SECONDS,
    path: "/",
    sameSite: "lax",
  });
}
