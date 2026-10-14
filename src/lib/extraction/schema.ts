import { readFileSync } from "fs";
import { join } from "path";
import { z } from "zod";

export const confidenceField = <T extends z.ZodTypeAny>(valueSchema: T) =>
  z.object({
    value: valueSchema,
    confidence: z.number().min(0).max(1),
  });

export const lineItemSchema = z.object({
  description: confidenceField(z.string()),
  quantity: confidenceField(z.number().nullable()).optional(),
  unitPrice: confidenceField(z.number().nullable()).optional(),
  amount: confidenceField(z.number()),
});

export const receiptExtractionSchema = z.object({
  isReceipt: z.boolean(),
  merchant: confidenceField(z.string()).optional(),
  date: confidenceField(z.string()).optional(),
  currency: confidenceField(z.string()).optional(),
  category: confidenceField(z.string()).optional(),
  subtotal: confidenceField(z.number().nullable()).optional(),
  tax: confidenceField(z.number().nullable()).optional(),
  total: confidenceField(z.number()).optional(),
  lineItems: z.array(lineItemSchema).default([]),
  notes: z.string().optional(),
});

export type ReceiptExtraction = z.infer<typeof receiptExtractionSchema>;

export const REVIEW_CONFIDENCE_THRESHOLD = 0.75;

export function getPrompt(): string {
  try {
    return readFileSync(join(process.cwd(), "eval", "prompt.txt"), "utf8");
  } catch {
    return "Extract structured receipt data with per-field confidence scores.";
  }
}
