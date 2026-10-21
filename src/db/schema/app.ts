import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
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

export const recurringFrequency = pgEnum("recurring_frequency", ["weekly", "monthly", "yearly"]);
export const recurringEnd = pgEnum("recurring_end", ["never", "after_count", "on_date"]);
export const recurringDelivery = pgEnum("recurring_delivery", ["draft", "auto_email"]);

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
  accentColor: text("accent_color").notNull().default("#111111"),
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
    // Units of the owner's base currency per unit of `currency`, as of `fxRateDate` (the date of the
    // exchange rates used). NULL when no rate was known; 1 when `currency` is the base currency.
    fxRateToBase: numeric("fx_rate_to_base", { precision: 20, scale: 10, mode: "string" }),
    fxRateDate: date("fx_rate_date", { mode: "string" }),
    // The base currency `fxRateToBase` was computed against; the rate is only trusted while the
    // profile's base is still this currency. NULL whenever `fxRateToBase` is NULL.
    fxBaseCurrency: text("fx_base_currency"),
    // A recurring `auto_email` invoice still waiting to be emailed: set when the run generates it,
    // cleared once the email is out (or given up on), so an interrupted run never loses a delivery.
    emailPending: boolean("email_pending").notNull().default(false),
    // The recurring schedule that generated this invoice (NULL for every other invoice).
    recurringScheduleId: uuid("recurring_schedule_id").references((): AnyPgColumn => recurringSchedules.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("invoices_user_id_number_idx").on(t.userId, t.number),
    // One invoice per schedule and run date: what makes a repeated cron run harmless.
    uniqueIndex("invoices_recurring_schedule_id_issue_date_idx").on(t.recurringScheduleId, t.issueDate),
    index("invoices_user_id_status_idx").on(t.userId, t.status),
    index("invoices_user_id_issue_date_idx").on(t.userId, t.issueDate),
    // The recurring run's sweep of auto-emails still to send reads only these few rows.
    index("invoices_email_pending_idx").on(t.createdAt).where(sql`${t.emailPending}`),
  ],
);

/** Daily exchange rates against EUR (ECB / Frankfurter): `perEur` units of `currency` per 1 EUR. */
export const exchangeRates = pgTable(
  "exchange_rates",
  {
    date: date("date", { mode: "string" }).notNull(),
    currency: text("currency").notNull(),
    perEur: numeric("per_eur", { precision: 20, scale: 10, mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.date, t.currency] })],
);

/**
 * A rule that creates a copy of `sourceInvoiceId` on every run date. `anchorDay` is the day of the
 * month the first run fell on (monthly and yearly runs clamp it to short months).
 */
export const recurringSchedules = pgTable(
  "recurring_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sourceInvoiceId: uuid("source_invoice_id").references((): AnyPgColumn => invoices.id, { onDelete: "set null" }),
    frequency: recurringFrequency("frequency").notNull(),
    interval: integer("interval").notNull().default(1),
    anchorDay: integer("anchor_day").notNull(),
    nextRunOn: date("next_run_on", { mode: "string" }).notNull(),
    endType: recurringEnd("end_type").notNull().default("never"),
    endCount: integer("end_count"),
    endDate: date("end_date", { mode: "string" }),
    runsDone: integer("runs_done").notNull().default(0),
    delivery: recurringDelivery("delivery").notNull().default("draft"),
    active: boolean("active").notNull().default(true),
    // Why the last run needs attention (a code the UI translates); cleared by the next clean run.
    lastError: text("last_error"),
    // Consecutive runs that threw; the schedule is deactivated after MAX_FAILED_RUNS (reset by a clean run).
    failedRuns: integer("failed_runs").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("recurring_schedules_active_next_run_on_idx").on(t.active, t.nextRunOn),
    index("recurring_schedules_user_id_idx").on(t.userId),
    // One schedule per source invoice (NULLs, i.e. deleted sources, do not collide).
    uniqueIndex("recurring_schedules_source_invoice_id_idx").on(t.sourceInvoiceId),
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

/**
 * Fixed-window counters of `consumeRateLimit` (`@/lib/rate-limit`): rate limits for actions open to
 * anyone, kept in the database because serverless instances share no memory. `key` names who is
 * limited for what, e.g. `claim:<invoice token>:<client IP>`.
 */
export const actionRateLimits = pgTable(
  "action_rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  },
  (t) => [index("action_rate_limits_window_start_idx").on(t.windowStart)],
);
