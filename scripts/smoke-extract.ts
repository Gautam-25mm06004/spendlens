/**
 * Smoke test: validates extraction pipeline wiring (no API key required for validate path).
 * With GOOGLE_GENERATIVE_AI_API_KEY set, also runs one live vision extract on eval sample.
 */
import "dotenv/config";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { validateExtraction } from "../src/lib/extraction/validate";
import type { ReceiptExtraction } from "../src/lib/extraction/schema";

const sample: ReceiptExtraction = {
  isReceipt: true,
  merchant: { value: "Test Mart", confidence: 0.9 },
  date: { value: "2026-03-01", confidence: 0.88 },
  currency: { value: "USD", confidence: 0.95 },
  category: { value: "Groceries", confidence: 0.8 },
  tax: { value: 2.5, confidence: 0.85 },
  total: { value: 27.5, confidence: 0.9 },
  lineItems: [
    { description: { value: "Milk", confidence: 0.9 }, amount: { value: 25, confidence: 0.9 } },
  ],
};

const validation = validateExtraction(sample);
if (validation.status !== "confirmed") {
  console.error("Validation smoke failed:", validation);
  process.exit(1);
}
console.log("✓ validateExtraction smoke passed");

const sampleImage = join(process.cwd(), "eval", "receipts", "sample-01.jpg");
if (process.env.GOOGLE_GENERATIVE_AI_API_KEY && existsSync(sampleImage)) {
  const { extractFromImage } = await import("../src/lib/extraction/extract");
  const bytes = readFileSync(sampleImage);
  const result = await extractFromImage(bytes, "image/jpeg");
  console.log("✓ live extract:", result.validation.status, `(${result.latencyMs}ms)`);
} else {
  console.log("⊘ skipped live extract (no API key or eval/receipts/sample-01.jpg)");
}
