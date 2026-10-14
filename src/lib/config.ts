/** Runtime mode — demo when DB/Clerk are not configured (zero-setup local run). */

export const DEMO_USER_ID = "demo-user";

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isClerkConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
      process.env.CLERK_SECRET_KEY?.trim()
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

export function isVisionConfigured(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim());
}

export function isChatLlmConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim() ||
      process.env.GROQ_API_KEY?.trim()
  );
}

/** Demo = no Postgres. Auth/storage/LLM fallbacks activate automatically. */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "false") return false;
  if (process.env.DEMO_MODE === "true") return true;
  return !isDbConfigured();
}

export function getRuntimeMode(): "demo" | "production" {
  return isDemoMode() ? "demo" : "production";
}
