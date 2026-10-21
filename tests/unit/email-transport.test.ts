import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fromAddress, getEmailTransport, isEmailEnabled } from "@/lib/email";

const KEYS = ["EMAIL_TRANSPORT", "RESEND_API_KEY", "EMAIL_FROM_DOMAIN"] as const;

beforeEach(() => {
  for (const key of KEYS) vi.stubEnv(key, "");
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getEmailTransport", () => {
  it("is disabled without any configuration, and sending throws", async () => {
    expect(getEmailTransport().kind).toBe("disabled");
    expect(isEmailEnabled()).toBe(false);
    await expect(
      getEmailTransport().send({ from: "a@b.c", to: ["x@y.z"], subject: "s", html: "<p>h</p>", text: "h" }),
    ).rejects.toThrow(/not configured/i);
  });

  it("uses the file transport when EMAIL_TRANSPORT=file", () => {
    vi.stubEnv("EMAIL_TRANSPORT", "file");
    expect(getEmailTransport().kind).toBe("file");
    expect(isEmailEnabled()).toBe(true);
  });

  it("uses Resend when both RESEND_API_KEY and EMAIL_FROM_DOMAIN are set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.example.com");
    expect(getEmailTransport().kind).toBe("resend");
    expect(isEmailEnabled()).toBe(true);
  });

  it("needs both Resend variables", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    expect(getEmailTransport().kind).toBe("disabled");
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.example.com");
    expect(getEmailTransport().kind).toBe("disabled");
  });

  it("lets the file transport win over Resend", () => {
    vi.stubEnv("EMAIL_TRANSPORT", "file");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.example.com");
    expect(getEmailTransport().kind).toBe("file");
  });
});

describe("fromAddress", () => {
  it("strips quotes and angle brackets from the display name; file transport uses example.test", () => {
    vi.stubEnv("EMAIL_TRANSPORT", "file");
    expect(fromAddress('Studio "Donny" <x>')).toBe('"Studio Donny x" <invoice@example.test>');
  });

  it("uses EMAIL_FROM_DOMAIN otherwise", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.example.com");
    expect(fromAddress("Studio Donny")).toBe('"Studio Donny" <invoice@mail.example.com>');
  });

  it("removes line breaks and backslashes, collapses spaces and falls back to a default name", () => {
    vi.stubEnv("EMAIL_TRANSPORT", "file");
    expect(fromAddress("Evil\r\nBcc: x@y.z  \\ Co")).toBe('"Evil Bcc: x@y.z Co" <invoice@example.test>');
    expect(fromAddress('  "<>"  ')).toBe('"Invoice" <invoice@example.test>');
  });
});
