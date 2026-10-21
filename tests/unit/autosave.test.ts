import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAutosaver } from "@/features/invoices/autosave";

type Deferred = { value: string; resolve: (ok: boolean) => void };

/** A `save` whose calls stay pending until the test resolves them. */
function manualSave() {
  const calls: Deferred[] = [];
  let running = 0;
  let maxRunning = 0;
  const save = vi.fn((value: string) => {
    running++;
    maxRunning = Math.max(maxRunning, running);
    return new Promise<boolean>((resolve) => {
      calls.push({
        value,
        resolve: (ok) => {
          running--;
          resolve(ok);
        },
      });
    });
  });
  return { save, calls, maxRunning: () => maxRunning };
}

describe("createAutosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves after the debounce delay", async () => {
    const { save, calls } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("a");
    calls[0].resolve(true);
  });

  it("restarts the delay on every schedule and saves only the latest value", async () => {
    const { save, calls } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(600);
    saver.schedule("b");
    await vi.advanceTimersByTimeAsync(600);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(save.mock.calls).toEqual([["b"]]);
    calls[0].resolve(true);
  });

  it("keeps only the last payload scheduled during a running save and never overlaps saves", async () => {
    const { save, calls, maxRunning } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(1000);
    expect(save.mock.calls).toEqual([["a"]]);

    saver.schedule("b");
    saver.schedule("c");
    // Even after the debounce elapses, the running save blocks a second one.
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);

    calls[0].resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls).toEqual([["a"], ["c"]]);
    calls[1].resolve(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
    expect(maxRunning()).toBe(1);
  });

  it("sends the pending payload as soon as the running save completes, without waiting for the delay", async () => {
    const { save, calls } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(1000);
    saver.schedule("b");
    calls[0].resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls).toEqual([["a"], ["b"]]);
    calls[1].resolve(true);
  });

  it("flush saves the pending payload immediately and resolves once everything is written", async () => {
    const { save, calls } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    let flushed = false;
    const done = saver.flush().then(() => {
      flushed = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls).toEqual([["a"]]);
    expect(flushed).toBe(false);

    saver.schedule("b");
    calls[0].resolve(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls).toEqual([["a"], ["b"]]);
    expect(flushed).toBe(false);
    calls[1].resolve(true);
    await done;
    expect(flushed).toBe(true);
    // Nothing is left to fire afterwards.
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("flush with nothing scheduled resolves immediately", async () => {
    const { save } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    await saver.flush();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps going after a failed or throwing save", async () => {
    const save = vi.fn<(v: string) => Promise<boolean>>().mockResolvedValueOnce(false).mockRejectedValueOnce(new Error("boom")).mockResolvedValue(true);
    const saver = createAutosaver(save, { delayMs: 10 });
    saver.schedule("a");
    await vi.advanceTimersByTimeAsync(10);
    saver.schedule("b");
    await vi.advanceTimersByTimeAsync(10);
    saver.schedule("c");
    await vi.advanceTimersByTimeAsync(10);
    expect(save.mock.calls).toEqual([["a"], ["b"], ["c"]]);
  });

  it("cancel drops the scheduled payload, dispose also ignores later schedules", async () => {
    const { save } = manualSave();
    const saver = createAutosaver(save, { delayMs: 1000 });
    saver.schedule("a");
    saver.cancel();
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();

    saver.schedule("b");
    saver.dispose();
    saver.schedule("c");
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).not.toHaveBeenCalled();
  });
});
