import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listReceipts } from "@/lib/data/repository";

export async function GET() {
  try {
    const userId = await requireUserId();
    const receipts = await listReceipts(userId);
    return NextResponse.json({ receipts });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
