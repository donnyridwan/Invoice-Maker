// Frozen copies of client / business / payment-account data stored on an invoice, so later edits to
// those records never change an issued invoice.

export type ClientSnapshot = {
  name: string;
  company?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
};

export type BusinessSnapshot = {
  businessName: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  logoUrl?: string;
};

export type PaymentAccountSnapshot = {
  id: string;
  type: string;
  label: string;
  details: Record<string, string>;
  currency: string | null;
};
