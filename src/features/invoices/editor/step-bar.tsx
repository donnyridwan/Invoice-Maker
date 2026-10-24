"use client";

import type { ReactNode } from "react";

/**
 * The bar pinned to the bottom of the form, lined up with the form column: the step buttons, `back`
 * on the left and `next` on the right. No rule or panel: the form fades out under it.
 */
export function StepBar({ back, next }: { back?: ReactNode; next?: ReactNode }) {
  return (
    <div className="pointer-events-none sticky bottom-0 z-10 bg-linear-to-t from-white from-70% to-white/0 pt-8">
      <div className="pointer-events-auto mx-auto flex w-full max-w-[640px] items-center justify-between gap-3 px-4 pb-6 md:px-8">
        <div>{back}</div>
        <div>{next}</div>
      </div>
    </div>
  );
}
