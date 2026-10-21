import { NextIntlClientProvider } from "next-intl";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { buildInvoiceDocument } from "@/documents/build-document";
import { TemplateCard } from "@/features/invoices/editor/appearance-section";
import id from "@/messages/id.json";

const doc = buildInvoiceDocument({
  number: "INV-2026-001",
  status: "draft",
  language: "id",
  template: "minimal",
  accentColor: "#5850EC",
  currency: "IDR",
  issueDate: "2026-10-21",
  dueDate: "2026-11-04",
  business: { businessName: "Studio Donny" },
  client: { name: "PT Maju Jaya" },
  paymentAccounts: [],
  items: [],
  subtotalMinor: 0,
  discountType: "none",
  discountValue: 0,
  discountMinor: 0,
  totalMinor: 0,
});

function render(template: "minimal" | "classic" | "modern") {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="id" messages={id} timeZone="Asia/Jakarta">
      <TemplateCard template={template} index={0} doc={doc} selected={false} onSelect={vi.fn()} onKeyDown={vi.fn()} />
    </NextIntlClientProvider>,
  );
}

describe("TemplateCard", () => {
  it("renders the thumbnail container as a real inert, aria-hidden element", () => {
    const html = render("classic");
    const thumbnail = html.match(/<span[^>]*aria-hidden="true"[^>]*>/)?.[0] ?? "";
    expect(thumbnail).toMatch(/\sinert(=""|\s|>)/);
    expect(thumbnail).toContain("pointer-events-none");
  });

  it("shows the document in its own template, whatever the invoice uses", () => {
    expect(render("classic")).toContain('data-template="classic"');
    expect(render("modern")).toContain('data-template="modern"');
  });
});
