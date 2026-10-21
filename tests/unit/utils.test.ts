import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("merges conflicting tailwind classes and drops falsy values", () => {
    expect(cn("px-2", false && "hidden", "px-4")).toBe("px-4");
  });
});
