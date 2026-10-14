import type { ReceiptExtraction } from "./schema";
import { REVIEW_CONFIDENCE_THRESHOLD } from "./schema";

export type ValidationResult = {
  ok: boolean;
  errors: string[];
  reviewFields: string[];
  status: "confirmed" | "needs_review" | "failed";
};

function approxEqual(a: number, b: number, tolerance = 0.05): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function validateExtraction(data: ReceiptExtraction): ValidationResult {
  const errors: string[] = [];
  const reviewFields: string[] = [];

  if (!data.isReceipt) {
    return {
      ok: false,
      errors: ["Image does not appear to be a receipt or invoice."],
      reviewFields: [],
      status: "failed",
    };
  }

  const checkField = (path: string, confidence?: number) => {
    if (confidence != null && confidence < REVIEW_CONFIDENCE_THRESHOLD) {
      reviewFields.push(path);
    }
  };

  checkField("merchant", data.merchant?.confidence);
  checkField("date", data.date?.confidence);
  checkField("currency", data.currency?.confidence);
  checkField("category", data.category?.confidence);
  checkField("tax", data.tax?.confidence);
  checkField("total", data.total?.confidence);

  data.lineItems.forEach((item, i) => {
    checkField(`lineItems.${i}.description`, item.description.confidence);
    checkField(`lineItems.${i}.amount`, item.amount.confidence);
  });

  if (!data.total?.value && data.total?.value !== 0) {
    errors.push("Missing total amount.");
  }

  if (data.date?.value) {
    const parsed = Date.parse(data.date.value);
    if (Number.isNaN(parsed)) errors.push("Date is not parseable.");
  }

  const lineSum = data.lineItems.reduce((s, li) => s + (li.amount.value ?? 0), 0);
  const tax = data.tax?.value ?? 0;
  const total = data.total?.value;

  if (total != null && lineSum > 0) {
    if (!approxEqual(lineSum + tax, total, 0.1)) {
      errors.push(
        `Arithmetic mismatch: line items (${lineSum.toFixed(2)}) + tax (${tax.toFixed(2)}) ≠ total (${total.toFixed(2)}).`
      );
      reviewFields.push("total");
    }
  }

  if (errors.length > 0 && reviewFields.length === 0) {
    reviewFields.push("total");
  }

  const status =
    errors.length > 0 || reviewFields.length > 0 ? "needs_review" : "confirmed";

  return {
    ok: status === "confirmed",
    errors,
    reviewFields: [...new Set(reviewFields)],
    status,
  };
}

export function fieldConfidenceMap(data: ReceiptExtraction): Record<string, number> {
  const map: Record<string, number> = {};
  if (data.merchant) map.merchant = data.merchant.confidence;
  if (data.date) map.date = data.date.confidence;
  if (data.currency) map.currency = data.currency.confidence;
  if (data.category) map.category = data.category.confidence;
  if (data.tax) map.tax = data.tax.confidence;
  if (data.total) map.total = data.total.confidence;
  return map;
}
