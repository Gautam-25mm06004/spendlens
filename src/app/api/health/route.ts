import { NextResponse } from "next/server";
import { getPublicRuntimeInfo } from "@/lib/auth";

export async function GET() {
  return NextResponse.json({
    ok: true,
    ...getPublicRuntimeInfo(),
  });
}
