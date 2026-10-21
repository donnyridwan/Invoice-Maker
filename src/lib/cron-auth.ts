import { createHash, timingSafeEqual } from "node:crypto";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/**
 * Whether `request` carries `Authorization: Bearer ${CRON_SECRET}` (what Vercel Cron sends).
 * Compared in constant time (on digests, so the length does not leak); without a configured
 * secret nothing is authorized.
 */
export function isAuthorizedCron(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const token = header.slice("Bearer ".length);
  return token.length > 0 && timingSafeEqual(sha256(token), sha256(secret));
}
