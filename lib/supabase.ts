import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  // Don't throw at module load; let API routes throw a useful error.
  console.warn("[supabase] missing env: NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

export const supabaseAdmin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
  : null;

export function ensureSupabase() {
  if (!supabaseAdmin) {
    throw new Error("Supabase not configured. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.");
  }
  return supabaseAdmin;
}

// Demo user identity - replace with real auth later
export const DEMO_USER_ID = "demo";
