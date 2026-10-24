import { z } from "zod";
import {
  optionalCurrencyCode,
  optionalEmail,
  optionalText,
  requiredEmail,
  requiredText,
} from "@/lib/zod-helpers";

const swiftCode = z
  .string("required")
  .trim()
  .min(1, "required")
  .regex(/^[A-Za-z0-9]{8,11}$/, "invalidSwift")
  .transform((value) => value.toUpperCase());

/** How many label + value rows an "other" payment method can carry. */
export const CUSTOM_FIELD_COUNT = 6;
export const customFieldKeys = (n: number) => ({ label: `field${n}Label`, value: `field${n}Value` });
const CUSTOM_FIELD_NUMBERS = Array.from({ length: CUSTOM_FIELD_COUNT }, (_, index) => index + 1);

// field1Label, field1Value, … field6Value: the rows of an "other" method, each optional on its own.
const customFields = Object.fromEntries(
  CUSTOM_FIELD_NUMBERS.flatMap((n) => [
    [customFieldKeys(n).label, optionalText(60)],
    [customFieldKeys(n).value, optionalText(500)],
  ]),
) as Record<`field${number}${"Label" | "Value"}`, ReturnType<typeof optionalText>>;

const shared = {
  label: optionalText(100),
  currency: optionalCurrencyCode,
  isDefault: z.boolean().default(false),
};

export const paymentAccountSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("bank"),
    ...shared,
    bankName: requiredText(200),
    accountName: requiredText(200),
    accountNumber: requiredText(50),
  }),
  z.object({
    type: z.literal("paypal"),
    ...shared,
    email: requiredEmail,
  }),
  z.object({
    type: z.literal("wise"),
    ...shared,
    accountName: requiredText(200),
    email: optionalEmail,
    accountNumber: optionalText(50),
    iban: optionalText(50),
  }),
  z
    .object({
      type: z.literal("swift"),
      ...shared,
      bankName: requiredText(200),
      accountName: requiredText(200),
      swift: swiftCode,
      accountNumber: optionalText(50),
      iban: optionalText(50),
    })
    .refine((data) => Boolean(data.accountNumber || data.iban), {
      path: ["accountNumber"],
      message: "accountNumberOrIban",
    }),
  // A method of the user's own (e-wallet, QRIS, cash…): its name, label + value rows and/or
  // free-form instructions. A row needs both halves, and the method needs a row or instructions.
  z
    .object({
      type: z.literal("other"),
      ...shared,
      methodName: requiredText(100),
      ...customFields,
      instructions: optionalText(2000),
    })
    .superRefine((data, ctx) => {
      const values = data as unknown as Record<string, string | undefined>;
      let filled = 0;
      for (const n of CUSTOM_FIELD_NUMBERS) {
        const keys = customFieldKeys(n);
        const label = values[keys.label];
        const value = values[keys.value];
        if (label && !value) ctx.addIssue({ code: "custom", path: [keys.value], message: "required" });
        if (value && !label) ctx.addIssue({ code: "custom", path: [keys.label], message: "required" });
        if (label && value) filled += 1;
      }
      if (filled === 0 && !data.instructions) {
        ctx.addIssue({ code: "custom", path: [customFieldKeys(1).value], message: "required" });
      }
    }),
]);

export type PaymentAccountInput = z.output<typeof paymentAccountSchema>;
export type PaymentAccountType = PaymentAccountInput["type"];

export const PAYMENT_ACCOUNT_TYPES: PaymentAccountType[] = ["bank", "paypal", "wise", "swift", "other"];

