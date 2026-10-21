import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/features/auth/safe-next";

describe("safeNextPath", () => {
  it("keeps same-origin relative paths", () => {
    expect(safeNextPath("/clients?q=budi")).toBe("/clients?q=budi");
  });

  it("falls back for missing, absolute or protocol-relative targets", () => {
    expect(safeNextPath(undefined)).toBe("/dashboard");
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
  });
});
