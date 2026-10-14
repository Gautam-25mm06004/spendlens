import {
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const receiptStatus = [
  "processing",
  "needs_review",
  "confirmed",
  "failed",
] as const;
export type ReceiptStatus = (typeof receiptStatus)[number];

export const receipts = pgTable("receipts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  storagePath: text("storage_path").notNull(),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  status: text("status").$type<ReceiptStatus>().notNull().default("processing"),
  merchant: text("merchant"),
  receiptDate: date("receipt_date"),
  currency: text("currency").default("USD"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }),
  tax: numeric("tax", { precision: 12, scale: 2 }),
  total: numeric("total", { precision: 12, scale: 2 }),
  category: text("category"),
  extractionRaw: jsonb("extraction_raw"),
  fieldConfidence: jsonb("field_confidence"),
  validationErrors: jsonb("validation_errors"),
  fileHash: text("file_hash"),
  duplicateOf: uuid("duplicate_of"),
  pageCount: integer("page_count").default(1),
  model: text("model"),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

export const lineItems = pgTable("line_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  description: text("description").notNull(),
  quantity: numeric("quantity", { precision: 12, scale: 3 }),
  unitPrice: numeric("unit_price", { precision: 12, scale: 2 }),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
});

export const reviewQueue = pgTable("review_queue", {
  id: uuid("id").defaultRandom().primaryKey(),
  receiptId: uuid("receipt_id")
    .notNull()
    .references(() => receipts.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  fieldPath: text("field_path").notNull(),
  proposedValue: text("proposed_value"),
  correctedValue: text("corrected_value"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export const usageEvents = pgTable("usage_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  kind: text("kind").$type<"extraction" | "chat">().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
});

export type Receipt = typeof receipts.$inferSelect;
export type LineItem = typeof lineItems.$inferSelect;
export type ReviewQueueItem = typeof reviewQueue.$inferSelect;
export type UsageEvent = typeof usageEvents.$inferSelect;
