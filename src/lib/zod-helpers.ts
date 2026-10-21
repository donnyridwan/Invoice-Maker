import { z } from "zod";
import { isCurrencyCode } from "@/lib/currencies";

// Shared building blocks for the feature schemas. Messages are keys of the `validation`
// namespace (see translateValidation); "tooLong:200" carries its parameter after the colon.

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

export const requiredText = (max: number) =>
  z.string("required").trim().min(1, "required").max(max, `tooLong:${max}`);

/** Empty string or missing value becomes `undefined`. */
export const optionalText = (max: number) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, `tooLong:${max}`).optional());

export const requiredEmail = z.string("required").trim().min(1, "required").pipe(z.email("invalidEmail"));

export const optionalEmail = z.preprocess(
  emptyToUndefined,
  z.string().trim().pipe(z.email("invalidEmail")).optional(),
);

export const currencyCode = z.string("required").refine(isCurrencyCode, "invalidCurrency");

export const optionalCurrencyCode = z.preprocess(emptyToUndefined, currencyCode.optional());

/** Accepts a number or a numeric string. */
export const integerInRange = (min: number, max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() !== "" ? Number(value) : value),
    z.number("invalidNumber").int("invalidNumber").min(min, "invalidNumber").max(max, "invalidNumber"),
  );
