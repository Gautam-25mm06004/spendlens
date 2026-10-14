import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isClerkConfigured } from "@/lib/config";

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/upload(.*)",
  "/review(.*)",
  "/receipts(.*)",
  "/chat(.*)",
  "/api/receipts(.*)",
  "/api/chat(.*)",
  "/api/usage(.*)",
]);

const clerkProtect = clerkMiddleware(async (auth, req) => {
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default function middleware(req: NextRequest, event: unknown) {
  if (!isClerkConfigured()) {
    return NextResponse.next();
  }
  return clerkProtect(req, event as never);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
