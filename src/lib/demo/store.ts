import { randomUUID } from "crypto";
import type { ReceiptExtraction } from "@/lib/extraction/schema";
import type { ReceiptStatus } from "@/lib/db/schema";
import { DEMO_USER_ID } from "@/lib/config";

export type DemoReceipt = {
  id: string;
  userId: string;
  storagePath: string;
  fileName: string;
  mimeType: string;
  status: ReceiptStatus;
  merchant: string | null;
  receiptDate: string | null;
  currency: string | null;
  subtotal: string | null;
  tax: string | null;
  total: string | null;
  category: string | null;
  extractionRaw: ReceiptExtraction | null;
  fieldConfidence: Record<string, number> | null;
  validationErrors: string[] | null;
  fileHash: string | null;
  duplicateOf: string | null;
  pageCount: number;
  model: string | null;
  latencyMs: number | null;
  imageDataUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type DemoLineItem = {
  id: string;
  receiptId: string;
  userId: string;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  amount: string;
  confidence: string | null;
};

export type DemoReviewItem = {
  id: string;
  receiptId: string;
  userId: string;
  fieldPath: string;
  proposedValue: string | null;
  correctedValue: string | null;
  confidence: string | null;
  createdAt: Date;
};

type UsageKind = "extraction" | "chat";

function seedReceipts(): DemoReceipt[] {
  const now = new Date();
  return [
    {
      id: "demo-r1",
      userId: DEMO_USER_ID,
      storagePath: "demo/coffee.jpg",
      fileName: "coffee-shop.jpg",
      mimeType: "image/jpeg",
      status: "confirmed",
      merchant: "Blue Bottle Coffee",
      receiptDate: "2026-03-10",
      currency: "USD",
      subtotal: "11.50",
      tax: "1.15",
      total: "12.65",
      category: "Food",
      extractionRaw: null,
      fieldConfidence: { merchant: 0.95, total: 0.92 },
      validationErrors: null,
      fileHash: "seed-coffee",
      duplicateOf: null,
      pageCount: 1,
      model: "demo/seed",
      latencyMs: 0,
      imageDataUrl: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo-r2",
      userId: DEMO_USER_ID,
      storagePath: "demo/grocery.jpg",
      fileName: "grocery-mart.jpg",
      mimeType: "image/jpeg",
      status: "confirmed",
      merchant: "Fresh Mart",
      receiptDate: "2026-03-08",
      currency: "USD",
      subtotal: "42.00",
      tax: "3.36",
      total: "45.36",
      category: "Groceries",
      extractionRaw: null,
      fieldConfidence: { merchant: 0.9, total: 0.88 },
      validationErrors: null,
      fileHash: "seed-grocery",
      duplicateOf: null,
      pageCount: 1,
      model: "demo/seed",
      latencyMs: 0,
      imageDataUrl: null,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "demo-r3",
      userId: DEMO_USER_ID,
      storagePath: "demo/fuel.jpg",
      fileName: "fuel-station.jpg",
      mimeType: "image/jpeg",
      status: "needs_review",
      merchant: "QuickFuel",
      receiptDate: "2026-03-05",
      currency: "USD",
      subtotal: "38.00",
      tax: "3.04",
      total: "41.04",
      category: "Transport",
      extractionRaw: null,
      fieldConfidence: { merchant: 0.7, total: 0.65 },
      validationErrors: ["Low confidence on total"],
      fileHash: "seed-fuel",
      duplicateOf: null,
      pageCount: 1,
      model: "demo/seed",
      latencyMs: 0,
      imageDataUrl: null,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

function seedLineItems(): DemoLineItem[] {
  return [
    {
      id: "demo-li-1",
      receiptId: "demo-r1",
      userId: DEMO_USER_ID,
      description: "Latte",
      quantity: "1",
      unitPrice: "5.50",
      amount: "5.50",
      confidence: "0.9",
    },
    {
      id: "demo-li-2",
      receiptId: "demo-r1",
      userId: DEMO_USER_ID,
      description: "Pastry",
      quantity: "1",
      unitPrice: "6.00",
      amount: "6.00",
      confidence: "0.88",
    },
  ];
}

function seedReview(): DemoReviewItem[] {
  return [
    {
      id: "demo-rv-1",
      receiptId: "demo-r3",
      userId: DEMO_USER_ID,
      fieldPath: "total",
      proposedValue: "41.04",
      correctedValue: null,
      confidence: "0.65",
      createdAt: new Date(),
    },
  ];
}

const store = {
  receipts: seedReceipts(),
  lineItems: seedLineItems(),
  reviewQueue: seedReview(),
  usage: [] as { id: string; userId: string; kind: UsageKind; createdAt: Date }[],
};

export const demoStore = {
  listReceipts(userId: string) {
    return store.receipts
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  getReceipt(userId: string, id: string) {
    const receipt = store.receipts.find((r) => r.id === id && r.userId === userId);
    if (!receipt) return null;
    return {
      receipt,
      lineItems: store.lineItems.filter((li) => li.receiptId === id),
      reviewQueue: store.reviewQueue.filter((rq) => rq.receiptId === id),
      imageUrl: receipt.imageDataUrl,
    };
  },

  findDuplicate(userId: string, fileHash: string) {
    const row = store.receipts.find(
      (r) => r.userId === userId && r.fileHash === fileHash
    );
    return row?.id ?? null;
  },

  insertReceipt(data: Omit<DemoReceipt, "id" | "createdAt" | "updatedAt">) {
    const receipt: DemoReceipt = {
      ...data,
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    store.receipts.unshift(receipt);
    return receipt;
  },

  updateReceipt(id: string, patch: Partial<DemoReceipt>) {
    const idx = store.receipts.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    store.receipts[idx] = {
      ...store.receipts[idx]!,
      ...patch,
      updatedAt: new Date(),
    };
    return store.receipts[idx]!;
  },

  insertLineItems(items: Omit<DemoLineItem, "id">[]) {
    for (const item of items) {
      store.lineItems.push({ ...item, id: randomUUID() });
    }
  },

  insertReviewItems(items: Omit<DemoReviewItem, "id" | "createdAt">[]) {
    for (const item of items) {
      store.reviewQueue.push({ ...item, id: randomUUID(), createdAt: new Date() });
    }
  },

  clearReviewForReceipt(receiptId: string) {
    store.reviewQueue = store.reviewQueue.filter((r) => r.receiptId !== receiptId);
  },

  listReview(userId: string) {
    return store.reviewQueue
      .filter((rq) => rq.userId === userId)
      .map((rq) => ({
        review: rq,
        receipt: store.receipts.find((r) => r.id === rq.receiptId)!,
      }))
      .filter((x) => x.receipt?.status === "needs_review");
  },

  getUsageCounts(userId: string) {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    const events = store.usage.filter(
      (e) => e.userId === userId && e.createdAt >= monthStart
    );
    return {
      extractions: events.filter((e) => e.kind === "extraction").length,
      chats: events.filter((e) => e.kind === "chat").length,
    };
  },

  recordUsage(userId: string, kind: UsageKind) {
    store.usage.push({
      id: randomUUID(),
      userId,
      kind,
      createdAt: new Date(),
    });
  },

  queryConfirmed(userId: string, filters: {
    category?: string;
    merchant?: string;
    startDate?: string;
    endDate?: string;
  }) {
    return store.receipts.filter((r) => {
      if (r.userId !== userId || r.status !== "confirmed") return false;
      if (filters.category && r.category !== filters.category) return false;
      if (filters.merchant && r.merchant !== filters.merchant) return false;
      if (filters.startDate && r.receiptDate && r.receiptDate < filters.startDate)
        return false;
      if (filters.endDate && r.receiptDate && r.receiptDate > filters.endDate)
        return false;
      return true;
    });
  },
};
