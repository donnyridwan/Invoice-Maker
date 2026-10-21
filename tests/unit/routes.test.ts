import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "@/components/app-shell/sidebar";
import { isAuthPath, isProtectedPath } from "@/lib/routes";

describe("protected routes", () => {
  it("cover every sidebar navigation item and their sub-pages", () => {
    for (const { href } of NAV_ITEMS) {
      expect(isProtectedPath(href), href).toBe(true);
      expect(isProtectedPath(`${href}/anything`), `${href}/anything`).toBe(true);
    }
  });

  it("cover the onboarding and payment account pages", () => {
    expect(isProtectedPath("/onboarding")).toBe(true);
    expect(isProtectedPath("/settings/payment-accounts")).toBe(true);
  });

  it("leave public pages alone and do not match on a shared prefix", () => {
    for (const path of ["/", "/login", "/register", "/api/auth/get-session", "/clientsx", "/i/abc"]) {
      expect(isProtectedPath(path), path).toBe(false);
    }
  });

  it("recognises the auth pages", () => {
    expect(isAuthPath("/login")).toBe(true);
    expect(isAuthPath("/register")).toBe(true);
    expect(isAuthPath("/login/x")).toBe(false);
  });
});
