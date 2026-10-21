import { afterEach, describe, expect, it, vi } from "vitest";
import { withDeadline } from "@/lib/pdf/deadline";

afterEach(() => vi.useRealTimers());

describe("withDeadline", () => {
  it("resolves with the work's value", async () => {
    await expect(withDeadline(Promise.resolve(42), 1000, "late")).resolves.toBe(42);
  });

  it("passes the work's own rejection through", async () => {
    await expect(withDeadline(Promise.reject(new Error("boom")), 1000, "late")).rejects.toThrow("boom");
  });

  it("rejects with the message when the work takes too long", async () => {
    vi.useFakeTimers();
    const pending = withDeadline(new Promise<never>(() => {}), 25_000, "took too long");
    const assertion = expect(pending).rejects.toThrow("took too long");
    await vi.advanceTimersByTimeAsync(25_000);
    await assertion;
  });

  it("leaves no timer behind", async () => {
    vi.useFakeTimers();
    await withDeadline(Promise.resolve(1), 25_000, "late");
    expect(vi.getTimerCount()).toBe(0);
  });
});
