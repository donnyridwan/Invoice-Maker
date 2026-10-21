// Frozen copies of client / business / payment-account data stored on an invoice, so later edits to
// those records never change an issued invoice. The builders import the source row types with
// `import type` only, so this module has no runtime dependency on the schema (which imports it).

import type { Client } from "@/features/clients/queries";
import type { PaymentAccount } from "@/features/payment-accounts/queries";
import type { BusinessProfile } from "@/features/profile/queries";

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


/** Drops null/empty values so snapshots only carry what was filled in. */
function present(value: string | null | undefined): string | undefined {
  return value ? value : undefined;
}

export function clientSnapshotFrom(client: Client): ClientSnapshot {
  const snapshot: ClientSnapshot = { name: client.name };
  const optional = {
    company: present(client.company),
    email: present(client.email),
    phone: present(client.phone),
    address: present(client.address),
    country: present(client.country),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) snapshot[key as keyof typeof optional] = value;
  }
  return snapshot;
}

export function businessSnapshotFrom(profile: BusinessProfile): BusinessSnapshot {
  const snapshot: BusinessSnapshot = { businessName: profile.businessName ?? "" };
  const optional = {
    email: present(profile.email),
    phone: present(profile.phone),
    address: present(profile.address),
    taxId: present(profile.taxId),
    logoUrl: present(profile.logoUrl),
  };
  for (const [key, value] of Object.entries(optional)) {
    if (value !== undefined) snapshot[key as keyof typeof optional] = value;
  }
  return snapshot;
}

export function paymentAccountSnapshotFrom(account: PaymentAccount): PaymentAccountSnapshot {
  return {
    id: account.id,
    type: account.type,
    label: account.label,
    details: { ...account.details },
    currency: account.currency,
  };
}
