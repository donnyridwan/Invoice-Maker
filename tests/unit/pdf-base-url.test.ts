import { describe, expect, it } from "vitest";
import { printBaseUrl, printBypassHeader } from "@/lib/pdf/base-url";

describe("printBaseUrl", () => {
  it("local: APP_URL, else BETTER_AUTH_URL, else localhost", () => {
    expect(printBaseUrl({ APP_URL: "http://localhost:3100/", BETTER_AUTH_URL: "http://x.test" })).toBe(
      "http://localhost:3100",
    );
    expect(printBaseUrl({ BETTER_AUTH_URL: "http://auth.test" })).toBe("http://auth.test");
    expect(printBaseUrl({})).toBe("http://localhost:3000");
  });

  it("Vercel production: APP_URL when set", () => {
    expect(
      printBaseUrl({
        VERCEL: "1",
        VERCEL_ENV: "production",
        APP_URL: "https://invoice.example.com/",
        VERCEL_PROJECT_PRODUCTION_URL: "proj.vercel.app",
      }),
    ).toBe("https://invoice.example.com");
  });

  it("Vercel production: the production domain when APP_URL is missing or invalid", () => {
    const base = { VERCEL: "1", VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "proj.vercel.app" };
    expect(printBaseUrl(base)).toBe("https://proj.vercel.app");
    expect(printBaseUrl({ ...base, APP_URL: "not a url" })).toBe("https://proj.vercel.app");
  });

  it("Vercel preview: the branch URL, else the deployment URL, and never APP_URL", () => {
    const env = {
      VERCEL: "1",
      VERCEL_ENV: "preview",
      APP_URL: "https://invoice.example.com",
      VERCEL_BRANCH_URL: "proj-git-feat-team.vercel.app",
      VERCEL_URL: "proj-abc123.vercel.app",
    };
    expect(printBaseUrl(env)).toBe("https://proj-git-feat-team.vercel.app");
    expect(printBaseUrl({ ...env, VERCEL_BRANCH_URL: "" })).toBe("https://proj-abc123.vercel.app");
  });

  it("Vercel without the needed variables falls back to the local rules", () => {
    expect(printBaseUrl({ VERCEL: "1", VERCEL_ENV: "preview", APP_URL: "https://a.test" })).toBe("https://a.test");
    expect(printBaseUrl({ VERCEL: "1", VERCEL_ENV: "development", APP_URL: "http://localhost:3000" })).toBe(
      "http://localhost:3000",
    );
  });

  it("ignores Vercel variables when not running on Vercel", () => {
    expect(printBaseUrl({ VERCEL_ENV: "preview", VERCEL_URL: "x.vercel.app" })).toBe("http://localhost:3000");
  });
});

describe("printBypassHeader", () => {
  it("is the protection-bypass header when the secret is set", () => {
    expect(printBypassHeader({ VERCEL_AUTOMATION_BYPASS_SECRET: "s3cret" })).toEqual({
      "x-vercel-protection-bypass": "s3cret",
    });
  });
  it("is null without a secret", () => {
    expect(printBypassHeader({})).toBeNull();
    expect(printBypassHeader({ VERCEL_AUTOMATION_BYPASS_SECRET: " " })).toBeNull();
  });
});
