import {
  DEMO_USER_ID,
  isClerkConfigured,
  isDemoMode,
  isVisionConfigured,
  isChatLlmConfigured,
  getRuntimeMode,
} from "@/lib/config";

export async function requireUserId(): Promise<string> {
  if (isDemoMode() || !isClerkConfigured()) {
    return DEMO_USER_ID;
  }

  try {
    const { auth } = await import("@clerk/nextjs/server");
    const { userId } = await auth();
    if (!userId) throw new Error("Unauthorized");
    return userId;
  } catch {
    return DEMO_USER_ID;
  }
}

export function getPublicRuntimeInfo() {
  return {
    mode: getRuntimeMode(),
    demo: isDemoMode(),
    clerk: isClerkConfigured(),
    vision: isVisionConfigured(),
    chatLlm: isChatLlmConfigured(),
  };
}
