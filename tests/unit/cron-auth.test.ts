import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isAuthorizedCron } from "@/lib/cron-auth";

const request = (authorization?: string) =>
  new Request("http://localhost/api/cron/fx", authorization === undefined ? {} : { headers: { authorization } });

beforeEach(() => vi.stubEnv("CRON_SECRET", "s3cret-value"));
afterEach(() => vi.unstubAllEnvs());

describe("isAuthorizedCron", () => {
  it("accepts the right bearer token", () => {
    expect(isAuthorizedCron(request("Bearer s3cret-value"))).toBe(true);
  });

  it("rejects a wrong token, a different length, a missing header and other schemes", () => {
    expect(isAuthorizedCron(request("Bearer s3cret-valuf"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer s3cret"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer s3cret-value-and-more"))).toBe(false);
    expect(isAuthorizedCron(request())).toBe(false);
    expect(isAuthorizedCron(request("s3cret-value"))).toBe(false);
    expect(isAuthorizedCron(request("Basic s3cret-value"))).toBe(false);
    expect(isAuthorizedCron(request("Bearer "))).toBe(false);
  });

  it("rejects everything when CRON_SECRET is empty or unset, even an empty bearer", () => {
    vi.stubEnv("CRON_SECRET", "");
    expect(isAuthorizedCron(request("Bearer "))).toBe(false);
    expect(isAuthorizedCron(request("Bearer anything"))).toBe(false);
    vi.stubEnv("CRON_SECRET", undefined);
    expect(isAuthorizedCron(request("Bearer undefined"))).toBe(false);
  });
});
