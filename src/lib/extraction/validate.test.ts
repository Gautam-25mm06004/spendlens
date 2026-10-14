import { describe, expect, it } from "vitest";
import type { ReceiptExtraction } from "@/lib/extraction/schema";
import { validateExtraction } from "@/lib/extraction/validate";

const baseReceipt: ReceiptExtraction = {
  isReceipt: true,
  merchant: { value: "Coffee Shop", confidence: 0.95 },
  date: { value: "2026-01-15", confidence: 0.9 },
  currency: { value: "USD", confidence: 0.99 },
  category: { value: "Food", confidence: 0.85 },
  tax: { value: 1.2, confidence: 0.9 },
  total: { value: 13.2, confidence: 0.92 },
  lineItems: [
    {
      description: { value: "Latte", confidence: 0.9 },
      amount: { value: 12, confidence: 0.9 },
    },
  ],
};

describe("validateExtraction", () => {
  it("confirms a balanced receipt with high confidence", () => {
    const result = validateExtraction(baseReceipt);
    expect(result.status).toBe("confirmed");
    expect(result.errors).toHaveLength(0);
  });

  it("flags arithmetic mismatch for review", () => {
    const bad = {
      ...baseReceipt,
      total: { value: 99, confidence: 0.95 },
    };
    const result = validateExtraction(bad);
    expect(result.status).toBe("needs_review");
    expect(result.errors.some((e) => e.includes("Arithmetic"))).toBe(true);
  });

  it("fails non-receipt images", () => {
    const result = validateExtraction({ isReceipt: false, lineItems: [] });
    expect(result.status).toBe("failed");
  });

  it("flags low-confidence fields", () => {
    const low = {
      ...baseReceipt,
      merchant: { value: "?", confidence: 0.4 },
    };
    const result = validateExtraction(low);
    expect(result.reviewFields).toContain("merchant");
  });
});
