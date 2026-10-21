import { z } from "zod";
import { addDays, isIsoDate, todayInJakarta } from "@/lib/dates";
import { optionalText, requiredText } from "@/lib/zod-helpers";

/** At most this many claims can wait for the owner's decision on one invoice. */
export const MAX_PENDING_CLAIMS = 3;

/** A client's "I've paid" report. The date may be at most tomorrow (time-zone slack). */
export const paymentClaimSchema = z.object({
  payerName: requiredText(200),
  paidOn: z.string("required").superRefine((value, ctx) => {
    if (!isIsoDate(value)) {
      ctx.addIssue({ code: "custom", message: "invalidDate" });
    } else if (value > addDays(todayInJakarta(), 1)) {
      ctx.addIssue({ code: "custom", message: "paidOnFuture" });
    }
  }),
  amountMinor: z
    .number("invalidAmount")
    .int("invalidAmount")
    .min(1, "invalidAmount")
    .max(Number.MAX_SAFE_INTEGER, "amountTooLarge"),
  note: optionalText(2000),
});

export type PaymentClaimInput = z.input<typeof paymentClaimSchema>;
