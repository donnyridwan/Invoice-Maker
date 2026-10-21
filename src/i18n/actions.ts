"use server";

import { cookies } from "next/headers";
import { updateUiLocale } from "@/features/profile/queries";
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

  // Signed-in users also keep the choice on their profile.
  const user = await getOptionalUser();
  if (user) await updateUiLocale(user.id, resolved);
}
