type HeaderReader = { get(name: string): string | null };

/**
 * The client's IP as the platform reports it: Vercel's own header first (it cannot be set by the
 * client), then `x-real-ip`, then the first hop of `x-forwarded-for`. "unknown" when none is present.
 */
export function getClientIp(headers: HeaderReader): string {
  const candidates = [
    headers.get("x-vercel-forwarded-for"),
    headers.get("x-real-ip"),
    headers.get("x-forwarded-for")?.split(",")[0],
  ];
  for (const candidate of candidates) {
    const ip = candidate?.trim();
    if (ip) return ip.slice(0, 64);
  }
  return "unknown";
}
