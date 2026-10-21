import { z } from "zod";
import { isCurrencyCode, type CurrencyCode } from "@/lib/currencies";

// Messages are keys of the `validation` namespace (see translateValidation).

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const requiredText = (max: number) =>
  z.string("required").trim().min(1, "required").max(max, `tooLong:${max}`);

const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `tooLong:${max}`).optional());

const requiredEmail = z.string("required").trim().min(1, "required").pipe(z.email("invalidEmail"));
const optionalEmail = z.preprocess(emptyToUndefined, z.string().trim().pipe(z.email("invalidEmail")).optional());

const swiftCode = z
  .string("required")
  .trim()
  .min(1, "required")
  .regex(/^[A-Za-z0-9]{8,11}$/, "invalidSwift")
  .transform((value) => value.toUpperCase());

const shared = {
  label: optionalText(100),
  currency: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .refine((value): value is CurrencyCode => isCurrencyCode(value), "invalidCurrency")
      .optional(),
  ),
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

