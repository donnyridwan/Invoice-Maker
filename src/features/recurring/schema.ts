import { z } from "zod";
import { isIsoDate, todayInJakarta } from "@/lib/dates";
import { RECURRING_END_TYPES, RECURRING_FREQUENCIES } from "@/lib/recurrence";
import { emptyToUndefined, integerInRange } from "@/lib/zod-helpers";

export const RECURRING_DELIVERIES = ["draft", "auto_email"] as const;
export type RecurringDelivery = (typeof RECURRING_DELIVERIES)[number];

export const MAX_INTERVAL = 12;
export const MAX_END_COUNT = 120;

const isoDate = z.string("required").refine(isIsoDate, "invalidDate");

/**
 * What the "make recurring" dialog submits. The parsed result is normalised: `endCount` is set
 * only for `after_count` and `endDate` only for `on_date` (null otherwise).
 */
export const recurringScheduleSchema = z
  .object({
    frequency: z.enum(RECURRING_FREQUENCIES, "invalidValue"),
    interval: integerInRange(1, MAX_INTERVAL),
    nextRunOn: isoDate,
    endType: z.enum(RECURRING_END_TYPES, "invalidValue"),
    endCount: z.preprocess(emptyToUndefined, integerInRange(1, MAX_END_COUNT).optional()),
    endDate: z.preprocess(emptyToUndefined, isoDate.optional()),
    delivery: z.enum(RECURRING_DELIVERIES, "invalidValue"),
  })
  .superRefine((data, ctx) => {
    if (isIsoDate(data.nextRunOn) && data.nextRunOn < todayInJakarta()) {
      ctx.addIssue({ code: "custom", path: ["nextRunOn"], message: "dateInPast" });
    }
    if (data.endType === "after_count" && data.endCount === undefined) {
      ctx.addIssue({ code: "custom", path: ["endCount"], message: "required" });
    }
    if (data.endType === "on_date") {
      if (data.endDate === undefined) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "required" });
      } else if (isIsoDate(data.endDate) && isIsoDate(data.nextRunOn) && data.endDate <= data.nextRunOn) {
        ctx.addIssue({ code: "custom", path: ["endDate"], message: "endNotAfterStart" });
      }
    }
  })
  .transform((data) => ({
    frequency: data.frequency,
    interval: data.interval,
    nextRunOn: data.nextRunOn,
    endType: data.endType,
    endCount: data.endType === "after_count" ? (data.endCount ?? null) : null,
    endDate: data.endType === "on_date" ? (data.endDate ?? null) : null,
    delivery: data.delivery,
  }));

export type RecurringScheduleInput = z.input<typeof recurringScheduleSchema>;
export type RecurringScheduleData = z.output<typeof recurringScheduleSchema>;
