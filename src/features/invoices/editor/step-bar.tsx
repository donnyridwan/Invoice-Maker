"use client";

import type { ReactNode } from "react";

/**
 * The bar pinned to the bottom of the form, lined up with the form column: the step buttons, `back`
 * on the left and `next` on the right.
 */
export function StepBar({ back, next }: { back?: ReactNode; next?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-border bg-white/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[640px] items-center justify-between gap-3 px-4 py-3 md:px-8">
        <div>{back}</div>
        <div>{next}</div>
      </div>
    </div>
  );
}
