import { describe, expect, it } from "vitest";
import { isLinkPreviewBot } from "@/lib/link-preview-bots";

describe("isLinkPreviewBot", () => {
  it.each([
    "WhatsApp/2.23.20.0 A",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Facebot",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "TelegramBot (like TwitterBot)",
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0)",
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (Macintosh) Version/14.0 Safari/605.1.15 (Applebot/0.1)",
    "Mozilla/5.0 (Windows NT 6.1; WOW64) SkypeUriPreview Preview/0.5",
    "whatsapp/2.0",
    "TWITTERBOT",
  ])("recognises %s", (ua) => {
    expect(isLinkPreviewBot(ua)).toBe(true);
  });

  it.each([
    "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
  ])("lets a real browser through: %s", (ua) => {
    expect(isLinkPreviewBot(ua)).toBe(false);
  });

  it("treats a missing user agent as a person", () => {
    expect(isLinkPreviewBot(null)).toBe(false);
    expect(isLinkPreviewBot(undefined)).toBe(false);
    expect(isLinkPreviewBot("")).toBe(false);
  });
});
