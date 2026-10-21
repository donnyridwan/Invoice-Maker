import { describe, expect, it } from "vitest";
import { getClientIp } from "@/lib/client-ip";

const headers = (entries: Record<string, string>) => new Headers(entries);

describe("getClientIp", () => {
  it("prefers Vercel's header, then x-real-ip, then the first x-forwarded-for hop", () => {
    expect(getClientIp(headers({ "x-vercel-forwarded-for": "1.1.1.1", "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("1.1.1.1");
    expect(getClientIp(headers({ "x-real-ip": "2.2.2.2", "x-forwarded-for": "3.3.3.3" }))).toBe("2.2.2.2");
    expect(getClientIp(headers({ "x-forwarded-for": " 3.3.3.3 , 10.0.0.1" }))).toBe("3.3.3.3");
  });

  it("is 'unknown' without a header and caps the length", () => {
    expect(getClientIp(headers({}))).toBe("unknown");
    expect(getClientIp(headers({ "x-forwarded-for": "a".repeat(200) }))).toHaveLength(64);
  });
});
