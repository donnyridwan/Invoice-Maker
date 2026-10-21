import { describe, expect, it, vi } from "vitest";
import { settleAction } from "@/lib/action-result";

describe("settleAction", () => {
  it("passes a returned result through", async () => {
    await expect(settleAction(async () => ({ ok: true as const, data: 1 }))).resolves.toEqual({ ok: true, data: 1 });
    const failure = { ok: false as const, error: "validation", fieldErrors: { name: ["required"] } };
    await expect(settleAction(async () => failure)).resolves.toEqual(failure);
  });

  it("turns a rejected server action (e.g. a request body over the size limit) into an unknown error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      settleAction(async () => {
        throw new Error("Body exceeded 6mb limit");
      }),
    ).resolves.toEqual({ ok: false, error: "unknown" });
    spy.mockRestore();
  });
});
