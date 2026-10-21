import { describe, expect, it } from "vitest";
import { resolveLocale } from "@/i18n/config";
import id from "@/messages/id.json";
import en from "@/messages/en.json";

function flatten(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return value !== null && typeof value === "object"
      ? flatten(value as Record<string, unknown>, path)
      : [path];
  });
}

describe("resolveLocale", () => {
  it("accepts supported locales", () => {
    expect(resolveLocale("en")).toBe("en");
    expect(resolveLocale("id")).toBe("id");
  });

  it("falls back to id for unsupported or missing values", () => {
    expect(resolveLocale("fr")).toBe("id");
    expect(resolveLocale(undefined)).toBe("id");
    expect(resolveLocale(null)).toBe("id");
    expect(resolveLocale("")).toBe("id");
  });
});

describe("message catalogs", () => {
  it("have the same set of keys in id and en", () => {
    expect(flatten(id).sort()).toEqual(flatten(en).sort());
  });

  it("contain every required namespace", () => {
    for (const ns of [
      "common",
      "nav",
      "auth",
      "onboarding",
      "dashboard",
      "settings",
      "paymentAccounts",
      "clients",
      "catalog",
      "validation",
    ]) {
      expect(id).toHaveProperty(ns);
      expect(en).toHaveProperty(ns);
    }
  });
});
