/** Allowed characters/length for an invoice number (also used for manual edits). */
export const INVOICE_NUMBER_RE = /^[A-Za-z0-9/._-]{1,40}$/;

/** `{prefix}{year}-{seq padded to 3}`, e.g. INV-2026-007. */
export function formatInvoiceNumber(prefix: string, year: number, seq: number): string {
  return `${prefix}${year}-${String(seq).padStart(3, "0")}`;
}

/**
 * Picks the next invoice number for an invoice issued in `issueYear`. The sequence restarts at 1
 * when the issue year is later than the year it was last numbered in; with no year yet
 * (`numberYear: null`) it keeps `nextNumber` and records the year. A back-dated invoice (earlier
 * year) takes the next number without resetting the running sequence.
 */
export function allocateInvoiceNumber(
  state: { prefix: string; nextNumber: number; numberYear: number | null },
  issueYear: number,
): { number: string; next: { nextNumber: number; numberYear: number } } {
  const restart = state.numberYear !== null && issueYear > state.numberYear;
  const seq = restart ? 1 : state.nextNumber;
  const numberYear = state.numberYear === null || restart ? issueYear : state.numberYear;
  return {
    number: formatInvoiceNumber(state.prefix, issueYear, seq),
    next: { nextNumber: seq + 1, numberYear },
  };
}
