/**
 * Reads seed photo binaries from disk and uploads them into the
 * `photos` Supabase Storage bucket under a trip-scoped prefix.
 *
 * On Vercel the `src/seed/europe-2026/photos` directory is bundled
 * into the serverless function thanks to
 * `next.config.mjs → outputFileTracingIncludes`. Locally the files
 * live at the same path relative to `process.cwd()`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

function contentTypeFor(file: string): string {
  const ext = path.extname(file).toLowerCase();
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/**
 * Uploads a single file from the seed photos directory.
 * Returns the storage path relative to the bucket (e.g.
 * `{tripId}/seed/places/gallopin.png`).
 */
export async function uploadSeedPhoto(
  admin: SupabaseClient,
  opts: {
    tripId: string;
    prefix: "places" | "cities";
    file: string; // basename in src/seed/europe-2026/photos
  }
): Promise<string> {
  const fsPath = path.join(
    process.cwd(),
    "src",
    "seed",
    "europe-2026",
    "photos",
    opts.file
  );
  const buf = await readFile(fsPath);
  const storagePath = `${opts.tripId}/seed/${opts.prefix}/${opts.file}`;
  const { error } = await admin.storage.from("photos").upload(
    storagePath,
    buf,
    {
      contentType: contentTypeFor(opts.file),
      upsert: true,
    }
  );
  if (error) {
    throw new Error(
      `Failed to upload seed photo ${opts.file}: ${error.message}`
    );
  }
  return storagePath;
}

/**
 * Uploads all requested files in parallel. Returns a map from
 * basename -> storage path. Failed uploads throw.
 */
export async function uploadSeedPhotos(
  admin: SupabaseClient,
  tripId: string,
  files: Array<{ prefix: "places" | "cities"; file: string }>
): Promise<Map<string, string>> {
  const results = await Promise.all(
    files.map(async (f) => {
      const storagePath = await uploadSeedPhoto(admin, { tripId, ...f });
      return [f.file, storagePath] as const;
    })
  );
  return new Map(results);
}
