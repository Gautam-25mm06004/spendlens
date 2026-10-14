import { NextResponse } from "next/server";
import { getPublicRuntimeInfo, requireUserId } from "@/lib/auth";
import { getUsageCounts } from "@/lib/data/repository";

export async function GET() {
  try {
    const userId = await requireUserId();
    const usage = await getUsageCounts(userId);
    return NextResponse.json({ ...usage, ...getPublicRuntimeInfo() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
