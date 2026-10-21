import { ValidationError } from "./errors";

export type DiscountType = "none" | "percent" | "fixed";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
// The TS target predates ES2020, so BigInt literals (500n) are unavailable.
const ZERO = BigInt(0);
const HALF_MILLI = BigInt(500);
const MILLI = BigInt(1000);
const HALF_BP = BigInt(5000);
const BP = BigInt(10000);

function toSafeNumber(value: bigint): number {
  if (value > MAX_SAFE) throw new ValidationError({ _form: ["amountTooLarge"] });
  return Number(value);
}

function lineAmount(quantityMilli: number, unitPriceMinor: number): bigint {
  // round half up: quantity is in thousandths
  return (BigInt(quantityMilli) * BigInt(unitPriceMinor) + HALF_MILLI) / MILLI;
}

/** round_half_up(quantity_milli x unit_price_minor / 1000), in integer minor units. */
export function calcLineAmount(quantityMilli: number, unitPriceMinor: number): number {
  return toSafeNumber(lineAmount(quantityMilli, unitPriceMinor));
}

/**
 * Line amounts, subtotal, discount and total in minor units. `percent` discount values are in
 * basis points (1250 = 12.5%); a discount never exceeds the subtotal.
 */
export function calcTotals(
  items: { quantityMilli: number; unitPriceMinor: number }[],
  discount: { type: DiscountType; value: number },
): { lineAmounts: number[]; subtotalMinor: number; discountMinor: number; totalMinor: number } {
  const amounts = items.map((item) => lineAmount(item.quantityMilli, item.unitPriceMinor));
  const subtotal = amounts.reduce((sum, amount) => sum + amount, ZERO);

  let discountValue = ZERO;
  if (discount.type === "percent") {
    discountValue = (subtotal * BigInt(discount.value) + HALF_BP) / BP;
  } else if (discount.type === "fixed") {
    discountValue = BigInt(discount.value);
  }
  const applied = discountValue > subtotal ? subtotal : discountValue;

  return {
    lineAmounts: amounts.map(toSafeNumber),
    subtotalMinor: toSafeNumber(subtotal),
    discountMinor: toSafeNumber(applied),
    totalMinor: toSafeNumber(subtotal - applied),
  };
}
