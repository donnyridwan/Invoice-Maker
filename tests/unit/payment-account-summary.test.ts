import { describe, expect, it } from "vitest";
import { summarizePaymentAccount } from "@/features/payment-accounts/summary";

describe("summarizePaymentAccount", () => {
  it("summarizes a bank account with a masked number", () => {
    expect(
      summarizePaymentAccount({
        type: "bank",
        label: "",
        details: { bankName: "BCA", accountName: "Donny", accountNumber: "1234567890" },
      }),
    ).toEqual({ title: "BCA", subtitle: "Donny · •••• 7890" });
  });

  it("summarizes a PayPal account by its email", () => {
    expect(
      summarizePaymentAccount({ type: "paypal", label: "", details: { email: "pay@donny.com" } }),
    ).toEqual({ title: "PayPal", subtitle: "pay@donny.com" });
  });

  it("lets a custom label win over the default title", () => {
    expect(
      summarizePaymentAccount({
        type: "bank",
        label: "Rekening USD",
        details: { bankName: "BCA", accountName: "Donny", accountNumber: "1234567890" },
      }),
    ).toEqual({ title: "Rekening USD", subtitle: "Donny · •••• 7890" });
  });

  it("summarizes SWIFT, Wise and other accounts", () => {
    expect(
      summarizePaymentAccount({
        type: "swift",
        label: "",
        details: { bankName: "DBS", accountName: "Donny", swift: "DBSSSGSG", iban: "SG1234567890" },
      }),
    ).toEqual({ title: "DBS", subtitle: "Donny · •••• 7890 · DBSSSGSG" });
    expect(
      summarizePaymentAccount({ type: "wise", label: "", details: { accountName: "Donny", email: "w@donny.com" } }),
    ).toEqual({ title: "Wise", subtitle: "Donny · w@donny.com" });
    expect(
      summarizePaymentAccount({ type: "other", label: "", details: { instructions: "Transfer ke GoPay\n0812" } }),
    ).toEqual({ title: "Transfer ke GoPay", subtitle: "" });
    expect(
      summarizePaymentAccount({
        type: "other",
        label: "",
        details: { methodName: "GoPay", field1Label: "Nomor HP", field1Value: "0812 3456 7890" },
      }),
    ).toEqual({ title: "GoPay", subtitle: "Nomor HP: 0812 3456 7890" });
  });
});
