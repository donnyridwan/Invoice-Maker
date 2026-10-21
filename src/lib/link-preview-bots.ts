/** Lower-case User-Agent fragments of crawlers that fetch a link only to build a preview. */
const BOT_FRAGMENTS = [
  "whatsapp",
  "facebookexternalhit",
  "facebot",
  "slackbot",
  "telegrambot",
  "twitterbot",
  "discordbot",
  "linkedinbot",
  "googlebot",
  "bingbot",
  "applebot",
  "skypeuripreview",
] as const;

/**
 * True when the User-Agent belongs to a link-preview bot or search crawler, whose visit must not
 * count as the client "viewing" an invoice. A missing User-Agent is treated as a person.
 */
export function isLinkPreviewBot(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  return BOT_FRAGMENTS.some((fragment) => ua.includes(fragment));
}
