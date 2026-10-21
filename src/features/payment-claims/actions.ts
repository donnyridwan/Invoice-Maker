"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { getPublicInvoice } from "@/features/invoices/queries";
import { toActionError, type ActionResult } from "@/lib/action-result";
import { isCurrencyCode } from "@/lib/currencies";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { parseMoneyInput } from "@/lib/money";
import { getClientIp } from "@/lib/client-ip";
import { consumeRateLimit } from "@/lib/rate-limit";
import { runUserAction } from "@/lib/run-user-action";
import { UPLOAD_RULES } from "@/lib/storage";
import { acceptClaim, createPaymentClaim, rejectClaim } from "./queries";

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Claim submissions per invoice link and client IP, within one hour. */
const CLAIM_RATE_LIMIT = { windowSeconds: 3600, max: 10 };

/**
 * Public action (the client has no account): "Saya sudah bayar". Fields: payerName, paidOn,
 * amount (typed, read in the invoice's currency and language), note and an optional `proof` file.
 * Every submission (valid or not) counts towards a limit of 10 per hour per invoice link and IP.
 */
export async function submitPaymentClaimAction(token: string, formData: FormData): Promise<ActionResult> {
  try {
    const invoice = await getPublicInvoice(token);
    if (!invoice || !isCurrencyCode(invoice.currency)) throw new NotFoundError("Invoice not found");

    const ip = getClientIp(await headers());
    const { allowed } = await consumeRateLimit(`claim:${token}:${ip}`, CLAIM_RATE_LIMIT);
    if (!allowed) throw new ValidationError({ _form: ["tooManyAttempts"] });

    const amountMinor = parseMoneyInput(text(formData, "amount"), invoice.currency, invoice.language as "id" | "en");
    if (amountMinor === null) throw new ValidationError({ amountMinor: ["invalidAmount"] });

    const file = formData.get("proof");
    let proof: { bytes: Uint8Array; size: number } | null = null;
    if (file instanceof File && file.size > 0) {
      // Cheap size check before the file is read into memory.
      if (file.size > UPLOAD_RULES["payment-proof"].maxBytes) throw new ValidationError({ file: ["fileTooLarge"] });
      proof = { bytes: new Uint8Array(await file.arrayBuffer()), size: file.size };
    }

    await createPaymentClaim(
      token,
      {
        payerName: text(formData, "payerName").trim(),
        paidOn: text(formData, "paidOn").trim(),
        amountMinor,
        note: text(formData, "note"),
      },
      proof,
    );
    revalidatePath(`/i/${token}`);
    revalidatePath("/invoices");
    revalidatePath("/dashboard");
    return { ok: true, data: undefined };
  } catch (e) {
    return toActionError(e);
  }
}

export async function acceptClaimAction(claimId: string): Promise<ActionResult> {
  return runUserAction("/invoices", async (userId) => {
    await acceptClaim(userId, claimId);
  });
}

export async function rejectClaimAction(claimId: string): Promise<ActionResult> {
  return runUserAction("/invoices", async (userId) => {
    await rejectClaim(userId, claimId);
  });
}
