import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import {
  checkQuota,
  createReceiptRecord,
  findDuplicateReceipt,
  recordUsage,
  saveExtractionResult,
  uploadReceiptFile,
} from "@/lib/data/repository";
import { extractFromImages } from "@/lib/extraction/extract";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const userId = await requireUserId();
    const quota = await checkQuota(userId, "extraction");
    if (!quota.allowed) {
      return NextResponse.json(
        { error: `Monthly extraction quota reached (${quota.used}/${quota.quota}).` },
        { status: 429 }
      );
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file." }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File exceeds 10 MB limit." }, { status: 400 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const fileHash = createHash("sha256").update(bytes).digest("hex");
    const duplicateId = await findDuplicateReceipt(userId, fileHash);
    if (duplicateId) {
      return NextResponse.json({
        duplicate: true,
        receiptId: duplicateId,
        message: "This receipt was already uploaded.",
      });
    }

    const uploaded = await uploadReceiptFile(userId, bytes, file, fileHash);
    if (uploaded.error) {
      return NextResponse.json({ error: uploaded.error }, { status: 500 });
    }

    const receipt = await createReceiptRecord(userId, {
      storagePath: uploaded.storagePath,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      fileHash,
      imageDataUrl: uploaded.imageDataUrl,
    });

    const pages = [
      {
        bytes,
        mimeType: file.type || "image/jpeg",
        fileName: file.name,
      },
    ];
    const result = await extractFromImages(pages);

    await saveExtractionResult(userId, receipt.id, {
      status: result.validation.status,
      extraction: result.extraction,
      fieldConfidence: result.fieldConfidence,
      validationErrors: result.validation.errors,
      reviewFields: result.validation.reviewFields,
      model: result.model,
      latencyMs: result.latencyMs,
      pageCount: pages.length,
    });

    await recordUsage(userId, "extraction");

    return NextResponse.json({
      receiptId: receipt.id,
      status: result.validation.status,
      extraction: result.extraction,
      validation: result.validation,
      latencyMs: result.latencyMs,
      demo: result.model === "demo/mock",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    const status = message === "Unauthorized" ? 401 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
