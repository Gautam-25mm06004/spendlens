import { NextResponse } from "next/server";
import { requireUserId } from "@/lib/auth";
import { listReviewQueue } from "@/lib/data/repository";

export async function GET() {
  try {
    const userId = await requireUserId();
    const items = await listReviewQueue(userId);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
