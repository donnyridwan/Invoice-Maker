import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/features/auth/safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/clients?q=a")).toBe("/clients?q=a");
    expect(safeNextPath("/clients?q=budi")).toBe("/clients?q=budi");
    expect(safeNextPath("/catalog?tab=archived#top")).toBe("/catalog?tab=archived#top");
    expect(safeNextPath("/%2F/evil.com")).toBe("/%2F/evil.com");
  });

  it("falls back for missing, absolute or protocol-relative targets", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("")).toBe("/dashboard");
    expect(safeNextPath("https://evil.com")).toBe("/dashboard");
    expect(safeNextPath("javascript:alert(1)")).toBe("/dashboard");
    expect(safeNextPath("//evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.com")).toBe("/dashboard");
  });

  it("falls back when tab, newline or encoded control characters could be stripped by a browser", () => {
    expect(safeNextPath("/%09/evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\t/evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\n/evil.com")).toBe("/dashboard");
    expect(safeNextPath("/\r\n/evil.com")).toBe("/dashboard");
    expect(safeNextPath("/%5Cevil.com")).toBe("/dashboard");
  });

  it("uses the given fallback", () => {
    expect(safeNextPath("//evil.com", "/home")).toBe("/home");
  });
});
