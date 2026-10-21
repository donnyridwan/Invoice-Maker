import { bigint, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  defaultNotes: text("default_notes"),
  uiLocale: text("ui_locale").notNull().default("id"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
  ...timestamps,
});

export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  type: paymentAccountType("type").notNull(),
  label: text("label").notNull(),
  details: jsonb("details").$type<Record<string, string>>().notNull().default({}),
  currency: text("currency").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

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
