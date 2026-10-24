import type { PaymentAccount } from "./queries";

type Summarizable = Pick<PaymentAccount, "type" | "label" | "details">;

const DOT = " · ";

function maskTail(value: string | undefined): string {
  return value ? `•••• ${value.slice(-4)}` : "";
}

function join(parts: (string | undefined)[]): string {
  return parts.filter(Boolean).join(DOT);
}

/** Short title + subtitle shown on a payment account card. A custom label replaces the title. */
export function summarizePaymentAccount(account: Summarizable): { title: string; subtitle: string } {
  const d = account.details;
  let title: string;
  let subtitle: string;

  switch (account.type) {
    case "bank":
      title = d.bankName ?? "";
      subtitle = join([d.accountName, maskTail(d.accountNumber)]);
      break;
    case "paypal":
      title = "PayPal";
      subtitle = d.email ?? "";
      break;
    case "wise":
      title = "Wise";
      subtitle = join([d.accountName, d.email ?? maskTail(d.accountNumber ?? d.iban)]);
      break;
    case "swift":
      title = d.bankName ?? "SWIFT";
      subtitle = join([d.accountName, maskTail(d.iban ?? d.accountNumber), d.swift]);
      break;
    default:
      // A custom method: its name (older ones only have instructions) and its first row.
      title = d.methodName ?? (d.instructions ?? "").split("\n")[0].slice(0, 60);
      subtitle = d.field1Label && d.field1Value ? `${d.field1Label}: ${d.field1Value}` : "";
  }

  return { title: account.label || title, subtitle };
}
