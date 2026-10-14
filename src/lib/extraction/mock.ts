import type { ReceiptExtraction } from "./schema";
import { fieldConfidenceMap, validateExtraction } from "./validate";
import type { ExtractResult } from "./extract";

/** Deterministic mock extraction — no API key required. */
export function mockExtract(
  fileName?: string,
  imageDataUrl?: string
): ExtractResult {
  const started = Date.now();
  const lower = (fileName ?? "").toLowerCase();

  let extraction: ReceiptExtraction;

  if (/fuel|gas|petrol/.test(lower)) {
    extraction = {
      isReceipt: true,
      merchant: { value: "QuickFuel Station", confidence: 0.72 },
      date: { value: "2026-03-12", confidence: 0.85 },
      currency: { value: "USD", confidence: 0.95 },
      category: { value: "Transport", confidence: 0.8 },
      tax: { value: 3.2, confidence: 0.7 },
      total: { value: 43.2, confidence: 0.68 },
      lineItems: [
        {
          description: { value: "Regular unleaded", confidence: 0.75 },
          amount: { value: 40, confidence: 0.74 },
        },
      ],
      notes: imageDataUrl ? "Demo mock from uploaded image" : "Demo mock extraction",
    };
  } else if (/groc|mart|super/.test(lower)) {
    extraction = {
      isReceipt: true,
      merchant: { value: "Neighborhood Grocers", confidence: 0.88 },
      date: { value: "2026-03-11", confidence: 0.9 },
      currency: { value: "USD", confidence: 0.96 },
      category: { value: "Groceries", confidence: 0.87 },
      tax: { value: 2.8, confidence: 0.86 },
      total: { value: 30.8, confidence: 0.9 },
      lineItems: [
        {
          description: { value: "Organic milk", confidence: 0.9 },
          amount: { value: 5.5, confidence: 0.9 },
        },
        {
          description: { value: "Bread", confidence: 0.88 },
          amount: { value: 4.5, confidence: 0.87 },
        },
        {
          description: { value: "Produce", confidence: 0.85 },
          amount: { value: 18, confidence: 0.84 },
        },
      ],
    };
  } else {
    extraction = {
      isReceipt: true,
      merchant: { value: "Demo Coffee Co.", confidence: 0.91 },
      date: { value: "2026-03-12", confidence: 0.89 },
      currency: { value: "USD", confidence: 0.97 },
      category: { value: "Food", confidence: 0.86 },
      tax: { value: 1.2, confidence: 0.88 },
      total: { value: 13.2, confidence: 0.9 },
      lineItems: [
        {
          description: { value: "Cappuccino", confidence: 0.92 },
          amount: { value: 12, confidence: 0.91 },
        },
      ],
      notes: imageDataUrl ? "Demo mock from uploaded image" : "Demo mock extraction",
    };
  }

  const validation = validateExtraction(extraction);
  return {
    extraction,
    validation,
    fieldConfidence: fieldConfidenceMap(extraction),
    model: "demo/mock",
    latencyMs: Date.now() - started + 120,
  };
}
