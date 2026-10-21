"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Width of an A4 page at 96 dpi (210 mm). */
const A4_WIDTH_PX = (210 / 25.4) * 96;

/**
 * Fits an A4 page into its container: measures the container width and shrinks the page with
 * `transform: scale()`, keeping the container exactly as tall as the scaled page. A zero-width
 * container is ignored (never scales to 0); the page stays hidden until the width is known.
 */
export function ScaledDocument({ children }: { children: ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    const outer = outerRef.current;
    const page = pageRef.current;
    if (!outer || !page) return;

    const measure = () => {
      // A container with no width (hidden tab, not laid out yet) says nothing about the scale:
      // keep the last fit, or stay hidden, until a real measurement arrives.
      if (outer.clientWidth <= 0) return;
      const scale = Math.min(1, outer.clientWidth / A4_WIDTH_PX);
      setFit({ scale, height: page.offsetHeight * scale });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(page);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={outerRef} className="w-full overflow-hidden" style={{ height: fit?.height }}>
      <div
        ref={pageRef}
        className="w-[210mm] origin-top-left"
        style={{ transform: fit ? `scale(${fit.scale})` : undefined, visibility: fit ? "visible" : "hidden" }}
      >
        {children}
      </div>
    </div>
  );
}
