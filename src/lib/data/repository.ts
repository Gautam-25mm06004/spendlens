import { and, count, desc, eq, gte, lte, sql } from "drizzle-orm";
import { isDemoMode, isSupabaseConfigured } from "@/lib/config";
import { demoStore } from "@/lib/demo/store";
import { getDb, schema } from "@/lib/db";
import type { ReceiptExtraction } from "@/lib/extraction/schema";
import type { ReceiptStatus } from "@/lib/db/schema";
import {
  createSupabaseServerClient,
  RECEIPTS_BUCKET,
} from "@/lib/supabase/server";
import type { SqlToolInput, SqlToolResult } from "@/lib/chat/sql-tool";

const EXTRACTION_QUOTA = Number(process.env.EXTRACTION_QUOTA_MONTHLY ?? 50);
const CHAT_QUOTA = Number(process.env.CHAT_QUOTA_MONTHLY ?? 200);

function monthStart(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function listReceipts(userId: string) {
  if (isDemoMode()) return demoStore.listReceipts(userId);
  const db = getDb();
  return db
    .select()
    .from(schema.receipts)
    .where(eq(schema.receipts.userId, userId))
    .orderBy(desc(schema.receipts.createdAt))
    .limit(100);
}

export async function getReceiptDetail(userId: string, id: string) {
  if (isDemoMode()) {
    const data = demoStore.getReceipt(userId, id);
    if (!data) return null;
    return data;
  }

  const db = getDb();
  const [receipt] = await db
    .select()
    .from(schema.receipts)
    .where(and(eq(schema.receipts.id, id), eq(schema.receipts.userId, userId)));
  if (!receipt) return null;

  const lineItems = await db
    .select()
    .from(schema.lineItems)
    .where(eq(schema.lineItems.receiptId, id));
  const reviewQueue = await db
    .select()
    .from(schema.reviewQueue)
    .where(eq(schema.reviewQueue.receiptId, id));

  let imageUrl: string | null = null;
  if (isSupabaseConfigured()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data: signed } = await supabase.storage
        .from(RECEIPTS_BUCKET)
        .createSignedUrl(receipt.storagePath, 3600);
      imageUrl = signed?.signedUrl ?? null;
    } catch {
      imageUrl = null;
    }
  }

  return { receipt, lineItems, reviewQueue, imageUrl };
}

export async function listReviewQueue(userId: string) {
  if (isDemoMode()) return demoStore.listReview(userId);
  const db = getDb();
  return db
    .select({ receipt: schema.receipts, review: schema.reviewQueue })
    .from(schema.reviewQueue)
    .innerJoin(schema.receipts, eq(schema.reviewQueue.receiptId, schema.receipts.id))
    .where(
      and(
        eq(schema.reviewQueue.userId, userId),
        eq(schema.receipts.status, "needs_review")
      )
    );
}

export async function findDuplicateReceipt(userId: string, fileHash: string) {
  if (isDemoMode()) return demoStore.findDuplicate(userId, fileHash);
  const db = getDb();
  const [row] = await db
    .select({ id: schema.receipts.id })
    .from(schema.receipts)
    .where(
      and(eq(schema.receipts.userId, userId), eq(schema.receipts.fileHash, fileHash))
    )
    .limit(1);
  return row?.id ?? null;
}

export async function getUsageCounts(userId: string) {
  if (isDemoMode()) {
    const u = demoStore.getUsageCounts(userId);
    return {
      ...u,
      extractionQuota: EXTRACTION_QUOTA,
      chatQuota: CHAT_QUOTA,
    };
  }

  const db = getDb();
  const since = monthStart();
  const [extractions] = await db
    .select({ n: count() })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        eq(schema.usageEvents.kind, "extraction"),
        gte(schema.usageEvents.createdAt, since)
      )
    );
  const [chats] = await db
    .select({ n: count() })
    .from(schema.usageEvents)
    .where(
      and(
        eq(schema.usageEvents.userId, userId),
        eq(schema.usageEvents.kind, "chat"),
        gte(schema.usageEvents.createdAt, since)
      )
    );

  return {
    extractions: extractions?.n ?? 0,
    chats: chats?.n ?? 0,
    extractionQuota: EXTRACTION_QUOTA,
    chatQuota: CHAT_QUOTA,
  };
}

export async function checkQuota(userId: string, kind: "extraction" | "chat") {
  const usage = await getUsageCounts(userId);
  if (kind === "extraction") {
    return {
      allowed: usage.extractions < usage.extractionQuota,
      used: usage.extractions,
      quota: usage.extractionQuota,
    };
  }
  return {
    allowed: usage.chats < usage.chatQuota,
    used: usage.chats,
    quota: usage.chatQuota,
  };
}

export async function recordUsage(userId: string, kind: "extraction" | "chat") {
  if (isDemoMode()) {
    demoStore.recordUsage(userId, kind);
    return;
  }
  const db = getDb();
  await db.insert(schema.usageEvents).values({ userId, kind });
}

export async function uploadReceiptFile(
  userId: string,
  bytes: Buffer,
  file: { name: string; type: string },
  fileHash: string
): Promise<{ storagePath: string; imageDataUrl: string | null; error?: string }> {
  const ext = file.name.split(".").pop() ?? "bin";
  const storagePath = `${userId}/${Date.now()}-${fileHash.slice(0, 8)}.${ext}`;

  if (isDemoMode()) {
    const mime = file.type || "image/jpeg";
    const imageDataUrl = `data:${mime};base64,${bytes.toString("base64")}`;
    return { storagePath, imageDataUrl };
  }

  if (!isSupabaseConfigured()) {
    return { storagePath, imageDataUrl: null, error: "Supabase storage is not configured." };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.storage
      .from(RECEIPTS_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false });
    if (error) return { storagePath, imageDataUrl: null, error: error.message };
    return { storagePath, imageDataUrl: null };
  } catch (e) {
    return {
      storagePath,
      imageDataUrl: null,
      error: e instanceof Error ? e.message : "Storage upload failed",
    };
  }
}

export async function createReceiptRecord(
  userId: string,
  data: {
    storagePath: string;
    fileName: string;
    mimeType: string;
    fileHash: string;
    imageDataUrl?: string | null;
  }
) {
  if (isDemoMode()) {
    return demoStore.insertReceipt({
      userId,
      storagePath: data.storagePath,
      fileName: data.fileName,
      mimeType: data.mimeType,
      status: "processing",
      merchant: null,
      receiptDate: null,
      currency: "USD",
      subtotal: null,
      tax: null,
      total: null,
      category: null,
      extractionRaw: null,
      fieldConfidence: null,
      validationErrors: null,
      fileHash: data.fileHash,
      duplicateOf: null,
      pageCount: 1,
      model: null,
      latencyMs: null,
      imageDataUrl: data.imageDataUrl ?? null,
    });
  }

  const db = getDb();
  const [receipt] = await db
    .insert(schema.receipts)
    .values({
      userId,
      storagePath: data.storagePath,
      fileName: data.fileName,
      mimeType: data.mimeType,
      status: "processing",
      fileHash: data.fileHash,
    })
    .returning();
  return receipt!;
}

export async function saveExtractionResult(
  userId: string,
  receiptId: string,
  result: {
    status: ReceiptStatus;
    extraction: ReceiptExtraction;
    fieldConfidence: Record<string, number>;
    validationErrors: string[];
    reviewFields: string[];
    model: string;
    latencyMs: number;
    pageCount: number;
  }
) {
  const getFieldValue = (path: string): string | null => {
    const e = result.extraction;
    if (path === "merchant") return e.merchant?.value ?? null;
    if (path === "date") return e.date?.value ?? null;
    if (path === "currency") return e.currency?.value ?? null;
    if (path === "category") return e.category?.value ?? null;
    if (path === "tax") return e.tax?.value?.toString() ?? null;
    if (path === "total") return e.total?.value?.toString() ?? null;
    return null;
  };

  if (isDemoMode()) {
    demoStore.updateReceipt(receiptId, {
      status: result.status,
      merchant: result.extraction.merchant?.value ?? null,
      receiptDate: result.extraction.date?.value ?? null,
      currency: result.extraction.currency?.value ?? "USD",
      subtotal: result.extraction.subtotal?.value?.toString() ?? null,
      tax: result.extraction.tax?.value?.toString() ?? null,
      total: result.extraction.total?.value?.toString() ?? null,
      category: result.extraction.category?.value ?? null,
      extractionRaw: result.extraction,
      fieldConfidence: result.fieldConfidence,
      validationErrors: result.validationErrors,
      model: result.model,
      latencyMs: result.latencyMs,
      pageCount: result.pageCount,
    });

    if (result.extraction.lineItems.length > 0) {
      demoStore.insertLineItems(
        result.extraction.lineItems.map((li) => ({
          receiptId,
          userId,
          description: li.description.value,
          quantity: li.quantity?.value?.toString() ?? null,
          unitPrice: li.unitPrice?.value?.toString() ?? null,
          amount: li.amount.value.toString(),
          confidence: li.amount.confidence.toString(),
        }))
      );
    }

    if (result.reviewFields.length > 0) {
      demoStore.insertReviewItems(
        result.reviewFields.map((fieldPath) => ({
          receiptId,
          userId,
          fieldPath,
          proposedValue: getFieldValue(fieldPath),
          correctedValue: null,
          confidence: "0.5",
        }))
      );
    }
    return;
  }

  const db = getDb();
  await db
    .update(schema.receipts)
    .set({
      status: result.status,
      merchant: result.extraction.merchant?.value ?? null,
      receiptDate: result.extraction.date?.value ?? null,
      currency: result.extraction.currency?.value ?? "USD",
      subtotal: result.extraction.subtotal?.value?.toString() ?? null,
      tax: result.extraction.tax?.value?.toString() ?? null,
      total: result.extraction.total?.value?.toString() ?? null,
      category: result.extraction.category?.value ?? null,
      extractionRaw: result.extraction,
      fieldConfidence: result.fieldConfidence,
      validationErrors: result.validationErrors,
      model: result.model,
      latencyMs: result.latencyMs,
      pageCount: result.pageCount,
      updatedAt: new Date(),
    })
    .where(eq(schema.receipts.id, receiptId));

  if (result.extraction.lineItems.length > 0) {
    await db.insert(schema.lineItems).values(
      result.extraction.lineItems.map((li) => ({
        receiptId,
        userId,
        description: li.description.value,
        quantity: li.quantity?.value?.toString() ?? null,
        unitPrice: li.unitPrice?.value?.toString() ?? null,
        amount: li.amount.value.toString(),
        confidence: li.amount.confidence.toString(),
      }))
    );
  }

  if (result.reviewFields.length > 0) {
    await db.insert(schema.reviewQueue).values(
      result.reviewFields.map((fieldPath) => ({
        receiptId,
        userId,
        fieldPath,
        proposedValue: getFieldValue(fieldPath),
        confidence: "0.5",
      }))
    );
  }
}

export async function confirmReceipt(
  userId: string,
  id: string,
  fields: Record<string, string | number | null>
) {
  if (isDemoMode()) {
    const existing = demoStore.getReceipt(userId, id);
    if (!existing) return false;
    demoStore.updateReceipt(id, {
      status: "confirmed",
      merchant: fields.merchant != null ? String(fields.merchant) : existing.receipt.merchant,
      receiptDate: fields.date != null ? String(fields.date) : existing.receipt.receiptDate,
      currency: fields.currency != null ? String(fields.currency) : existing.receipt.currency,
      category: fields.category != null ? String(fields.category) : existing.receipt.category,
      tax: fields.tax != null ? String(fields.tax) : existing.receipt.tax,
      total: fields.total != null ? String(fields.total) : existing.receipt.total,
    });
    demoStore.clearReviewForReceipt(id);
    return true;
  }

  const db = getDb();
  const [receipt] = await db
    .select()
    .from(schema.receipts)
    .where(and(eq(schema.receipts.id, id), eq(schema.receipts.userId, userId)));
  if (!receipt) return false;

  const patch: Partial<typeof schema.receipts.$inferInsert> = {
    status: "confirmed",
    updatedAt: new Date(),
  };
  if (fields.merchant != null) patch.merchant = String(fields.merchant);
  if (fields.date != null) patch.receiptDate = String(fields.date);
  if (fields.currency != null) patch.currency = String(fields.currency);
  if (fields.category != null) patch.category = String(fields.category);
  if (fields.tax != null) patch.tax = String(fields.tax);
  if (fields.total != null) patch.total = String(fields.total);

  await db.update(schema.receipts).set(patch).where(eq(schema.receipts.id, id));
  await db.delete(schema.reviewQueue).where(eq(schema.reviewQueue.receiptId, id));
  return true;
}

export async function runSqlTool(userId: string, input: SqlToolInput): Promise<SqlToolResult> {
  if (isDemoMode()) {
    const rows = demoStore.queryConfirmed(userId, {
      category: input.category,
      merchant: input.merchant,
      startDate: input.startDate,
      endDate: input.endDate,
    });
    const receiptIds = rows.map((r) => r.id);

    if (input.operation === "count") {
      return { rows: [{ count: rows.length }], receiptIds };
    }

    if (input.operation === "sum") {
      const byCurrency = new Map<string, number>();
      for (const r of rows) {
        const c = r.currency ?? "USD";
        byCurrency.set(c, (byCurrency.get(c) ?? 0) + Number(r.total ?? 0));
      }
      return {
        rows: [...byCurrency.entries()].map(([currency, total]) => ({
          total: total.toFixed(2),
          currency,
        })),
        receiptIds,
      };
    }

    if (input.operation === "group_by_category") {
      const map = new Map<string, { total: number; currency: string }>();
      for (const r of rows) {
        const key = `${r.category ?? "Uncategorized"}|${r.currency ?? "USD"}`;
        const prev = map.get(key) ?? { total: 0, currency: r.currency ?? "USD" };
        prev.total += Number(r.total ?? 0);
        map.set(key, prev);
      }
      return {
        rows: [...map.entries()].map(([key, v]) => ({
          category: key.split("|")[0],
          total: v.total.toFixed(2),
          currency: v.currency,
        })),
        receiptIds,
      };
    }

    if (input.operation === "group_by_merchant") {
      const map = new Map<string, { total: number; currency: string }>();
      for (const r of rows) {
        const key = `${r.merchant ?? "Unknown"}|${r.currency ?? "USD"}`;
        const prev = map.get(key) ?? { total: 0, currency: r.currency ?? "USD" };
        prev.total += Number(r.total ?? 0);
        map.set(key, prev);
      }
      return {
        rows: [...map.entries()].map(([key, v]) => ({
          merchant: key.split("|")[0],
          total: v.total.toFixed(2),
          currency: v.currency,
        })),
        receiptIds,
      };
    }

    const monthMap = new Map<string, { total: number; currency: string }>();
    for (const r of rows) {
      const month = r.receiptDate?.slice(0, 7) ?? "unknown";
      const key = `${month}|${r.currency ?? "USD"}`;
      const prev = monthMap.get(key) ?? { total: 0, currency: r.currency ?? "USD" };
      prev.total += Number(r.total ?? 0);
      monthMap.set(key, prev);
    }
    return {
      rows: [...monthMap.entries()].map(([key, v]) => ({
        month: key.split("|")[0],
        total: v.total.toFixed(2),
        currency: v.currency,
      })),
      receiptIds,
    };
  }

  const db = getDb();
  const conditions = [
    eq(schema.receipts.userId, userId),
    eq(schema.receipts.status, "confirmed"),
  ];
  if (input.startDate) conditions.push(gte(schema.receipts.receiptDate, input.startDate));
  if (input.endDate) conditions.push(lte(schema.receipts.receiptDate, input.endDate));
  if (input.category) conditions.push(eq(schema.receipts.category, input.category));
  if (input.merchant) conditions.push(eq(schema.receipts.merchant, input.merchant));
  const where = and(...conditions);

  if (input.operation === "sum") {
    const agg = await db
      .select({
        total: sql<string>`coalesce(sum(${schema.receipts.total}::numeric), 0)`,
        currency: schema.receipts.currency,
      })
      .from(schema.receipts)
      .where(where)
      .groupBy(schema.receipts.currency);
    const ids = await db.select({ id: schema.receipts.id }).from(schema.receipts).where(where);
    return {
      rows: agg.map((r) => ({ total: r.total, currency: r.currency })),
      receiptIds: ids.map((r) => r.id),
    };
  }

  if (input.operation === "count") {
    const [row] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.receipts)
      .where(where);
    const ids = await db.select({ id: schema.receipts.id }).from(schema.receipts).where(where);
    return { rows: [{ count: row?.count ?? 0 }], receiptIds: ids.map((r) => r.id) };
  }

  if (input.operation === "group_by_category") {
    const agg = await db
      .select({
        category: schema.receipts.category,
        total: sql<string>`coalesce(sum(${schema.receipts.total}::numeric), 0)`,
        currency: schema.receipts.currency,
      })
      .from(schema.receipts)
      .where(where)
      .groupBy(schema.receipts.category, schema.receipts.currency);
    const ids = await db.select({ id: schema.receipts.id }).from(schema.receipts).where(where);
    return {
      rows: agg.map((r) => ({
        category: r.category ?? "Uncategorized",
        total: r.total,
        currency: r.currency,
      })),
      receiptIds: ids.map((r) => r.id),
    };
  }

  if (input.operation === "group_by_merchant") {
    const agg = await db
      .select({
        merchant: schema.receipts.merchant,
        total: sql<string>`coalesce(sum(${schema.receipts.total}::numeric), 0)`,
        currency: schema.receipts.currency,
      })
      .from(schema.receipts)
      .where(where)
      .groupBy(schema.receipts.merchant, schema.receipts.currency)
      .limit(20);
    const ids = await db.select({ id: schema.receipts.id }).from(schema.receipts).where(where);
    return {
      rows: agg.map((r) => ({
        merchant: r.merchant ?? "Unknown",
        total: r.total,
        currency: r.currency,
      })),
      receiptIds: ids.map((r) => r.id),
    };
  }

  const agg = await db
    .select({
      month: sql<string>`to_char(${schema.receipts.receiptDate}, 'YYYY-MM')`,
      total: sql<string>`coalesce(sum(${schema.receipts.total}::numeric), 0)`,
      currency: schema.receipts.currency,
    })
    .from(schema.receipts)
    .where(where)
    .groupBy(sql`to_char(${schema.receipts.receiptDate}, 'YYYY-MM')`, schema.receipts.currency)
    .orderBy(sql`to_char(${schema.receipts.receiptDate}, 'YYYY-MM')`);
  const ids = await db.select({ id: schema.receipts.id }).from(schema.receipts).where(where);
  return {
    rows: agg.map((r) => ({ month: r.month, total: r.total, currency: r.currency })),
    receiptIds: ids.map((r) => r.id),
  };
}
