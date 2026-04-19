/**
 * Storage helpers for the `documents` bucket.
 *
 * The bucket is private, so clients cannot fetch files directly.
 * We mint short-lived signed URLs on the server and pass them to
 * the browser. Upload paths are namespaced by trip_id to line up
 * with the RLS policy in `20260418000003_storage_buckets.sql`
 * (`storage_trip_id` parses the first path segment as a UUID).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const DOCS_BUCKET = "documents";

/**
 * Create a signed URL for reading a document, valid for ~1 hour
 * by default. Returns null if the object is missing or the API
 * call fails.
 */
export async function signedDocUrl(
  admin: SupabaseClient,
  storagePath: string,
  expiresIn = 60 * 60
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(storagePath, expiresIn);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Same as `signedDocUrl`, but asks Supabase to respond with
 * `Content-Disposition: attachment; filename=...` so the browser
 * downloads the file rather than inline-previewing it.
 */
export async function signedDocDownloadUrl(
  admin: SupabaseClient,
  storagePath: string,
  filename: string,
  expiresIn = 60 * 60
): Promise<string | null> {
  const { data, error } = await admin.storage
    .from(DOCS_BUCKET)
    .createSignedUrl(storagePath, expiresIn, { download: filename });
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Compute a hex SHA-256 of an ArrayBuffer using Web Crypto.
 * Used for dedup on the `documents.content_hash` unique index.
 */
export async function sha256Hex(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(digest);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function storagePathFor(
  tripId: string,
  objectUuid: string,
  ext: string
): string {
  return `${tripId}/${objectUuid}.${ext}`;
}
