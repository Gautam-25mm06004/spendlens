import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";

export async function createSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Supabase env vars are not set");
  }

  const { getToken } = await auth();
  const token = await getToken();

  return createClient(url, anonKey, {
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    },
  });
}

export function createSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Supabase service role env vars are not set");
  }
  return createClient(url, serviceKey);
}

export const RECEIPTS_BUCKET = "receipts";
