import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signPrintPath, verifyPrintSignature } from "@/lib/signed-url";

const ID = "3f2c1a9e-6b1d-4c53-9a8e-2d7f0b1c4e55";
const OTHER_ID = "8a1b7c3d-0e4f-4a6b-b2c9-5d3e1f7a9c01";
const NOW = 1_800_000_000_000;

beforeEach(() => vi.stubEnv("PRINT_SECRET", "test"));
afterEach(() => vi.unstubAllEnvs());

/** `{ exp, sig }` of a signed path. */
function parts(path: string) {
  const url = new URL(path, "http://localhost");
  return { pathname: url.pathname, exp: url.searchParams.get("exp") ?? undefined, sig: url.searchParams.get("sig") ?? undefined };
}

describe("signPrintPath", () => {
  it("builds /print/<id>?exp=<unix seconds>&sig=<hex>", () => {
    const { pathname, exp, sig } = parts(signPrintPath(ID, NOW));
    expect(pathname).toBe(`/print/${ID}`);
    expect(exp).toBe(String(NOW / 1000 + 60));
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("refuses to sign without PRINT_SECRET", () => {
    vi.stubEnv("PRINT_SECRET", "");
    expect(() => signPrintPath(ID, NOW)).toThrow(/PRINT_SECRET/);
  });
});

describe("verifyPrintSignature", () => {
  it("accepts a freshly signed path", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(ID, exp, sig, NOW)).toBe(true);
  });

  it("is valid for 60 seconds and not one second longer", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(ID, exp, sig, NOW + 60_000)).toBe(true);
    expect(verifyPrintSignature(ID, exp, sig, NOW + 61_000)).toBe(false);
  });

  it("rejects a signature with one character changed", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    const flipped = `${sig!.slice(0, -1)}${sig!.endsWith("0") ? "1" : "0"}`;
    expect(verifyPrintSignature(ID, exp, flipped, NOW)).toBe(false);
  });

  it("rejects the same signature for another invoice", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(OTHER_ID, exp, sig, NOW)).toBe(false);
  });

  it("rejects a moved expiry", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(ID, String(Number(exp) + 3600), sig, NOW + 120_000)).toBe(false);
  });

  it("rejects a missing exp or sig", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(ID, undefined, sig, NOW)).toBe(false);
    expect(verifyPrintSignature(ID, exp, undefined, NOW)).toBe(false);
    expect(verifyPrintSignature(ID, undefined, undefined, NOW)).toBe(false);
  });

  it("rejects garbage without throwing", () => {
    const { exp } = parts(signPrintPath(ID, NOW));
    expect(verifyPrintSignature(ID, "abc", "zz", NOW)).toBe(false);
    expect(verifyPrintSignature(ID, exp, "", NOW)).toBe(false);
    expect(verifyPrintSignature(ID, exp, "ab", NOW)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    vi.stubEnv("PRINT_SECRET", "other");
    expect(verifyPrintSignature(ID, exp, sig, NOW)).toBe(false);
  });

  it("rejects everything when PRINT_SECRET is not configured", () => {
    const { exp, sig } = parts(signPrintPath(ID, NOW));
    vi.stubEnv("PRINT_SECRET", "");
    expect(verifyPrintSignature(ID, exp, sig, NOW)).toBe(false);
  });
});
