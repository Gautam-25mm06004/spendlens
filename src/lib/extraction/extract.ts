import { generateObject } from "ai";
import { isVisionConfigured } from "@/lib/config";
import { visionModel } from "@/lib/llm/router";
import { withTrace } from "@/lib/tracing/langfuse";
import { mockExtract } from "./mock";
import {
  getPrompt,
  receiptExtractionSchema,
  type ReceiptExtraction,
} from "./schema";
import { fieldConfidenceMap, validateExtraction } from "./validate";

export type ExtractResult = {
  extraction: ReceiptExtraction;
  validation: ReturnType<typeof validateExtraction>;
  fieldConfidence: Record<string, number>;
  model: string;
  latencyMs: number;
};

export async function extractFromImage(
  imageBytes: Buffer,
  mimeType: string,
  fileName?: string
): Promise<ExtractResult> {
  if (!isVisionConfigured()) {
    const mime = mimeType || "image/jpeg";
    const dataUrl = `data:${mime};base64,${imageBytes.toString("base64")}`;
    return mockExtract(fileName, dataUrl);
  }

  const started = Date.now();
  const modelId = process.env.VISION_MODEL ?? "google/gemini-3.5-flash";

  const result = await withTrace(
    "spendlens-extract",
    async () => {
      const { object } = await generateObject({
        model: visionModel(),
        schema: receiptExtractionSchema,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: getPrompt() },
              {
                type: "image",
                image: imageBytes,
                mediaType: mimeType,
              },
            ],
          },
        ],
        temperature: 0.1,
      });
      return object;
    },
    { model: modelId, mimeType }
  );

  const validation = validateExtraction(result);
  return {
    extraction: result,
    validation,
    fieldConfidence: fieldConfidenceMap(result),
    model: modelId,
    latencyMs: Date.now() - started,
  };
}

export async function extractFromImages(
  pages: { bytes: Buffer; mimeType: string; fileName?: string }[]
): Promise<ExtractResult> {
  if (pages.length === 1) {
    return extractFromImage(pages[0]!.bytes, pages[0]!.mimeType, pages[0]!.fileName);
  }

  const pageResults: ReceiptExtraction[] = [];
  let totalLatency = 0;
  for (const page of pages) {
    const r = await extractFromImage(page.bytes, page.mimeType);
    pageResults.push(r.extraction);
    totalLatency += r.latencyMs;
  }

  const merged: ReceiptExtraction = {
    isReceipt: pageResults.some((p) => p.isReceipt),
    merchant: pageResults.find((p) => p.merchant)?.merchant,
    date: pageResults.find((p) => p.date)?.date,
    currency: pageResults.find((p) => p.currency)?.currency ?? {
      value: "USD",
      confidence: 0.5,
    },
    category: pageResults.find((p) => p.category)?.category,
    tax: pageResults.reduce(
      (best, p) =>
        (p.tax?.value ?? 0) > (best?.value ?? 0) ? p.tax : best,
      pageResults[0]?.tax
    ),
    total: pageResults.reduce(
      (best, p) =>
        (p.total?.value ?? 0) > (best?.value ?? 0) ? p.total : best,
      pageResults[0]?.total
    ),
    lineItems: pageResults.flatMap((p) => p.lineItems),
    notes: `Merged from ${pages.length} pages`,
  };

  const validation = validateExtraction(merged);
  return {
    extraction: merged,
    validation,
    fieldConfidence: fieldConfidenceMap(merged),
    model: process.env.VISION_MODEL ?? "google/gemini-3.5-flash",
    latencyMs: totalLatency,
  };
}
