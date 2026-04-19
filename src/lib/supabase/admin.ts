/**
 * Admin Supabase client using the service_role key.
 * Bypasses RLS. Use ONLY on the server for operations that need
 * to run regardless of user session: Cowork ingest, server-side
 * backfills, one-off migrations, and trip CRUD in this app (the
 * auth gate lives in middleware, not in Supabase auth).
 *
 * The client is intentionally typed as `SupabaseClient<any>` so
 * inserts and updates compile without a generated Database type.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function createAdminClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  cached = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}
