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
  z.object({
    type: z.literal("other"),
    ...shared,
    instructions: requiredText(2000),
  }),
]);

export type PaymentAccountInput = z.output<typeof paymentAccountSchema>;
export type PaymentAccountType = PaymentAccountInput["type"];

export const PAYMENT_ACCOUNT_TYPES: PaymentAccountType[] = ["bank", "paypal", "wise", "swift", "other"];

