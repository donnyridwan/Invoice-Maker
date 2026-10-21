import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type {
  BusinessSnapshot,
  ClientSnapshot,
  PaymentAccountSnapshot,
} from "@/features/invoices/snapshots";
import { user } from "./auth";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const paymentAccountType = pgEnum("payment_account_type", [
  "bank",
  "paypal",
  "wise",
  "swift",
  "other",
]);

export const invoiceStatus = pgEnum("invoice_status", [
  "draft",
  "sent",
  "payment_claimed",
  "paid",
  "void",
]);

export const claimStatus = pgEnum("claim_status", ["pending", "accepted", "rejected"]);

export const businessProfiles = pgTable("business_profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  businessName: text("business_name"),
  email: text("email"),
  phone: text("phone"),
  address: text("address"),
  taxId: text("tax_id"),
  logoUrl: text("logo_url"),
  accentColor: text("accent_color").notNull().default("#5850EC"),
  defaultTemplate: text("default_template").notNull().default("minimal"),
  baseCurrency: text("base_currency").notNull().default("IDR"),
  defaultCurrency: text("default_currency").notNull().default("IDR"),
  defaultLanguage: text("default_language").notNull().default("id"),
  defaultDueDays: integer("default_due_days").notNull().default(14),
  invoicePrefix: text("invoice_prefix").notNull().default("INV-"),
  nextInvoiceNumber: integer("next_invoice_number").notNull().default(1),
  // Year `nextInvoiceNumber` belongs to; the sequence restarts when an invoice is issued in a later year.
  invoiceNumberYear: integer("invoice_number_year"),
  defaultNotes: text("default_notes"),
  uiLocale: text("ui_locale").notNull().default("id"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps,
});

export const paymentAccounts = pgTable(
  "payment_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: paymentAccountType("type").notNull(),
    label: text("label").notNull(),
    // Keys are camelCase: bankName, accountName, accountNumber, swift, iban, email, instructions.
    details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
    // NULL means the account accepts any currency.
    currency: text("currency"),
    isDefault: boolean("is_default").notNull().default(false),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    // At most one active default account per user.
    uniqueIndex("payment_accounts_one_default_per_user")
      .on(t.userId)
      .where(sql`${t.isDefault} AND ${t.archivedAt} IS NULL`),
  ],
);

export const clients = pgTable(
  "clients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    company: text("company"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    country: text("country"),
    defaultCurrency: text("default_currency"),
    defaultLanguage: text("default_language"),
    notes: text("notes"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("clients_user_id_name_idx").on(t.userId, t.name)],
);

export const catalogItems = pgTable("catalog_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit"),
  unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
  currency: text("currency").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    number: text("number").notNull(),
    status: invoiceStatus("status").notNull().default("draft"),
    currency: text("currency").notNull(),
    language: text("language").notNull(),
    template: text("template").notNull(),
    accentColor: text("accent_color").notNull(),
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    clientSnapshot: jsonb("client_snapshot").$type<ClientSnapshot>(),
    businessSnapshot: jsonb("business_snapshot").$type<BusinessSnapshot>().notNull(),
    paymentAccountsSnapshot: jsonb("payment_accounts_snapshot")
      .$type<PaymentAccountSnapshot[]>()
      .notNull()
      .default([]),
    // percent: basis points (1250 = 12.5%); fixed: minor units.
    discountType: text("discount_type").notNull().default("none"),
    discountValue: bigint("discount_value", { mode: "number" }).notNull().default(0),
    subtotalMinor: bigint("subtotal_minor", { mode: "number" }).notNull().default(0),
    discountMinor: bigint("discount_minor", { mode: "number" }).notNull().default(0),
    totalMinor: bigint("total_minor", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
    publicToken: text("public_token").notNull().unique(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    paidNote: text("paid_note"),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_user_id_number_idx").on(t.userId, t.number),
    index("invoices_user_id_status_idx").on(t.userId, t.status),
    index("invoices_user_id_issue_date_idx").on(t.userId, t.issueDate),
  ],
);

export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    // Thousandths: 1,5 -> 1500.
    quantityMilli: bigint("quantity_milli", { mode: "number" }).notNull(),
    unit: text("unit"),
    unitPriceMinor: bigint("unit_price_minor", { mode: "number" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
  },
  (t) => [index("invoice_items_invoice_id_position_idx").on(t.invoiceId, t.position)],
);

export const invoiceEvents = pgTable(
  "invoice_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("invoice_events_invoice_id_created_at_idx").on(t.invoiceId, t.createdAt)],
);

/** A client's "I've paid" report on an invoice, awaiting the owner's decision. */
export const paymentClaims = pgTable(
  "payment_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => invoices.id, { onDelete: "cascade" }),
    payerName: text("payer_name").notNull(),
    paidOn: date("paid_on", { mode: "string" }).notNull(),
    amountMinor: bigint("amount_minor", { mode: "number" }).notNull(),
    note: text("note"),
    // Stored proof file (see `@/lib/storage`), if the client attached one.
    proofUrl: text("proof_url"),
    status: claimStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("payment_claims_invoice_id_status_idx").on(t.invoiceId, t.status)],
);
