import type { ImageSize } from "./image-size";

/**
 * What a logo must be to print sharp on an invoice (it is shown up to 48pt, and printed at more
 * than twice that resolution): big enough, not huge, and not a thin strip.
 */
export const LOGO_RULES = {
  /** The longer side, in pixels. */
  minLongSide: 512,
  /** The shorter side, in pixels. */
  minShortSide: 128,
  maxSide: 4000,
  /** Longer side over shorter side. */
  maxRatio: 6,
} as const;

/** The validation key for a logo of this size (`logoTooSmall`, `logoTooBig`, `logoRatio`), or null when it fits. */
export function checkLogoSize({ width, height }: ImageSize): "logoTooSmall" | "logoTooBig" | "logoRatio" | null {
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  if (long < LOGO_RULES.minLongSide || short < LOGO_RULES.minShortSide) return "logoTooSmall";
  if (long > LOGO_RULES.maxSide) return "logoTooBig";
  if (long / short > LOGO_RULES.maxRatio) return "logoRatio";
  return null;
}
