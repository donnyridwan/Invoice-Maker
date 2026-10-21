import { afterEach, describe, expect, it, vi } from "vitest";
import { getAppUrl } from "@/lib/app-url";

const headers = (entries: Record<string, string>) => new Headers(entries);

afterEach(() => vi.unstubAllEnvs());

describe("getAppUrl", () => {
  it("prefers APP_URL over everything else", () => {
    vi.stubEnv("APP_URL", "https://app.example.com");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com");
    expect(getAppUrl(headers({ host: "other.test" }))).toBe("https://app.example.com");
  });

  it("falls back to BETTER_AUTH_URL", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "https://auth.example.com");
    expect(getAppUrl(headers({ host: "other.test" }))).toBe("https://auth.example.com");
  });

  it("drops trailing slashes", () => {
    vi.stubEnv("APP_URL", "https://app.example.com//");
    expect(getAppUrl()).toBe("https://app.example.com");
  });

  it("builds the origin from the forwarded headers when no env is set", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(getAppUrl(headers({ "x-forwarded-proto": "https", "x-forwarded-host": "inv.example.com", host: "internal:3000" }))).toBe(
      "https://inv.example.com",
    );
    expect(getAppUrl(headers({ host: "localhost:3100" }))).toBe("http://localhost:3100");
  });

  it("uses the first value of a comma separated forwarded header", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(getAppUrl(headers({ "x-forwarded-proto": "https, http", "x-forwarded-host": "a.test, b.test" }))).toBe("https://a.test");
  });

  it("ignores an env value that is not an http(s) URL", () => {
    vi.stubEnv("APP_URL", "not a url");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(getAppUrl(headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
  });

  it("returns localhost when there is nothing to go on", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("BETTER_AUTH_URL", "");
    expect(getAppUrl()).toBe("http://localhost:3000");
  });
});
