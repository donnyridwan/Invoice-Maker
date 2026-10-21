import { createHmac, timingSafeEqual } from "node:crypto";

/** How long a print URL stays valid. It only has to survive one Chromium navigation. */
const TTL_SECONDS = 60;

function secret(): string {
  const value = process.env.PRINT_SECRET;
  if (!value) throw new Error("PRINT_SECRET is not set; it signs the URL Chromium opens to render a PDF");
  return value;
}

function signature(invoiceId: string, exp: string): string {
  return createHmac("sha256", secret()).update(`${invoiceId}.${exp}`).digest("hex");
}

/**
 * `/print/<id>?exp=<unix seconds>&sig=<hex>`: a URL that opens the print page of one invoice for
 * 60 seconds. `sig` is HMAC-SHA256(PRINT_SECRET, "<id>.<exp>"). `now` is in milliseconds.
 */
export function signPrintPath(invoiceId: string, now: number = Date.now()): string {
  const exp = String(Math.floor(now / 1000) + TTL_SECONDS);
  return `/print/${invoiceId}?exp=${exp}&sig=${signature(invoiceId, exp)}`;
}

/** True when `sig` is the signature of `invoiceId` + `exp` and `exp` has not passed. Never throws. */
export function verifyPrintSignature(
  invoiceId: string,
  exp: string | undefined,
  sig: string | undefined,
  now: number = Date.now(),
): boolean {
  if (!exp || !sig || !process.env.PRINT_SECRET) return false;
  if (!/^\d{1,12}$/.test(exp) || !/^[0-9a-f]{64}$/.test(sig)) return false;
  if (Number(exp) * 1000 < now) return false;

  const expected = Buffer.from(signature(invoiceId, exp), "hex");
  const given = Buffer.from(sig, "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}
