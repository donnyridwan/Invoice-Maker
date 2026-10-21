import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localeFromRequest, rebaseVerificationUrl, sendVerificationEmail } from "@/emails/send-verification";
import { renderVerifyEmail } from "@/emails/verify-email";

describe("rebaseVerificationUrl", () => {
  it("keeps path and query but uses the configured origin", () => {
    expect(
      rebaseVerificationUrl("http://evil.test/api/auth/verify-email?token=abc&callbackURL=%2Fsettings", "https://app.example.com"),
    ).toBe("https://app.example.com/api/auth/verify-email?token=abc&callbackURL=%2Fsettings");
  });
});

describe("localeFromRequest", () => {
  const withCookie = (cookie?: string) => new Request("http://x.test", { headers: cookie ? { cookie } : {} });
  it("reads NEXT_LOCALE and defaults to id", () => {
    expect(localeFromRequest(withCookie("a=1; NEXT_LOCALE=en; b=2"))).toBe("en");
    expect(localeFromRequest(withCookie("NEXT_LOCALE=fr"))).toBe("id");
    expect(localeFromRequest(withCookie())).toBe("id");
    expect(localeFromRequest(undefined)).toBe("id");
  });

  it("falls back to id for a malformed cookie value instead of throwing", () => {
    expect(() => localeFromRequest(withCookie("NEXT_LOCALE=%E0%A4%A"))).not.toThrow();
    expect(localeFromRequest(withCookie("NEXT_LOCALE=%E0%A4%A"))).toBe("id");
    expect(localeFromRequest(withCookie("NEXT_LOCALE=%"))).toBe("id");
    expect(localeFromRequest(withCookie("x=%zz; NEXT_LOCALE=en"))).toBe("en");
  });

  it("decodes an encoded value", () => {
    expect(localeFromRequest(withCookie("NEXT_LOCALE=%65n"))).toBe("en");
  });
});

describe("renderVerifyEmail", () => {
  it("renders title, button and link in both bodies, in the requested language", async () => {
    const url = "https://app.example.com/api/auth/verify-email?token=t1";
    const id = await renderVerifyEmail({ locale: "id", name: "Donny", url });
    expect(id.subject).toBe("Verifikasi email kamu");
    expect(id.html).toContain("Verifikasi email");
    expect(id.html).toContain(`href="${url}"`);
    expect(id.text).toContain(url);
    expect(id.text).toContain("Halo Donny");

    const en = await renderVerifyEmail({ locale: "en", name: "Donny", url });
    expect(en.subject).toBe("Verify your email");
    expect(en.text).toContain("Hi Donny");
  });
});

describe("sendVerificationEmail", () => {
  beforeEach(() => {
    vi.stubEnv("EMAIL_TRANSPORT", "");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM_DOMAIN", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("throws when email is not configured (the settings card hides the button then)", async () => {
    await expect(
      sendVerificationEmail({ user: { email: "a@b.test", name: "A" }, url: "http://x.test/api/auth/verify-email?token=t" }),
    ).rejects.toThrow(/not configured/i);
  });
});
