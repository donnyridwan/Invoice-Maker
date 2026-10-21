// Debounced, serialised autosave. `createAutosaver` is framework-free so it can be unit-tested with
// fake timers; `useAutosave` (below) wires it to React state.

import { useCallback, useEffect, useRef, useState } from "react";

export type Autosaver<T> = {
  /** Saves `value` after the debounce delay; a newer value replaces an older one that is waiting. */
  schedule(value: T): void;
  /** Saves any waiting value right now and resolves once nothing is running or waiting. */
  flush(): Promise<void>;
  /** Drops the waiting value (a save that is already running is left alone). */
  cancel(): void;
  /** Like `cancel`, and ignores every later `schedule`. */
  dispose(): void;
};

/**
 * `save` resolves to whether the value was stored; it should not throw, but a rejection is treated
 * as a failed save. At most one save runs at a time: values scheduled while one is running replace
 * each other, and only the last one is sent, as soon as the running save finishes.
 */
export function createAutosaver<T>(
  save: (value: T) => Promise<boolean>,
  opts: { delayMs: number },
): Autosaver<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let waiting: { value: T } | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  function clearTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function start() {
    if (running || !waiting) return;
    const { value } = waiting;
    waiting = null;
    running = (async () => {
      try {
        await save(value);
      } catch {
        // A failed save is the caller's to report; the next value is still sent.
      } finally {
        running = null;
        // Whatever arrived while saving goes out now: nothing is gained by waiting any longer.
        if (waiting && !disposed) {
          clearTimer();
          start();
        }
      }
    })();
  }

  return {
    schedule(value) {
      if (disposed) return;
      waiting = { value };
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        start();
      }, opts.delayMs);
    },
    async flush() {
      clearTimer();
      start();
      while (running) await running;
    },
    cancel() {
      clearTimer();
      waiting = null;
    },
    dispose() {
      disposed = true;
      clearTimer();
      waiting = null;
    },
  };
}

export type AutosaveStatus = "idle" | "saving" | "saved" | "error" | "invalid";

/** How a save ended: stored, failed (network/server; worth retrying) or rejected as invalid. */
export type SaveOutcome = "saved" | "error" | "invalid";

const DEFAULT_DELAY_MS = 1000;

/**
 * Autosave for React: wraps `createAutosaver` and tracks the status shown to the user.
 *
 * - `schedule(value)`: the form is valid and changed; status becomes "saving" until it is stored.
 * - `markInvalid()`: the form is invalid; nothing is sent (a waiting value is dropped).
 * - `retry()`: sends the last valid value again (after an "error").
 * `save(value, isCurrent)` reports how it went; `isCurrent()` is false once the user has changed
 * the form again, so a stale result does not overwrite what is on screen.
 * Pending changes are flushed when the page is hidden and when the editor unmounts.
 */
export function useAutosave<T>(
  save: (value: T, isCurrent: () => boolean) => Promise<SaveOutcome>,
  { delayMs = DEFAULT_DELAY_MS }: { delayMs?: number } = {},
) {
  const [status, setStatus] = useState<AutosaveStatus>("idle");
  const saveRef = useRef(save);
  const version = useRef(0);
  const last = useRef<{ value: T } | null>(null);

  useEffect(() => {
    saveRef.current = save;
  });

  const saverRef = useRef<Autosaver<T> | null>(null);

  useEffect(() => {
    const saver = createAutosaver<T>(
      async (value) => {
        const startedAt = version.current;
        const isCurrent = () => version.current === startedAt;
        let outcome: SaveOutcome;
        try {
          outcome = await saveRef.current(value, isCurrent);
        } catch {
          outcome = "error";
        }
        if (isCurrent()) setStatus(outcome === "saved" ? "saved" : outcome);
        return outcome === "saved";
      },
      { delayMs },
    );
    saverRef.current = saver;

    const flush = () => void saver.flush();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flush);
      // Leaving the editor (or the page) still writes what is waiting.
      flush();
      saverRef.current = null;
    };
  }, [delayMs]);

  const schedule = useCallback(
    (value: T) => {
      version.current += 1;
      last.current = { value };
      setStatus("saving");
      saverRef.current?.schedule(value);
    },
    [],
  );

  const markInvalid = useCallback(() => {
    version.current += 1;
    saverRef.current?.cancel();
    setStatus("invalid");
  }, []);

  const retry = useCallback(() => {
    if (!last.current) return;
    version.current += 1;
    setStatus("saving");
    saverRef.current?.schedule(last.current.value);
    void saverRef.current?.flush();
  }, []);

  return { status, schedule, markInvalid, retry };
}
