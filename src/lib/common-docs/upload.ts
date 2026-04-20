/**
 * One-off uploader: reads the passport PDFs bundled in
 * `src/seed/common-docs/` and puts them into the private
 * `documents` Supabase Storage bucket under `common/*.pdf`.
 *
 * On Vercel the directory is included into the serverless function
 * bundle via `next.config.mjs → outputFileTracingIncludes`.
 * Idempotent: always uses `upsert: true`.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DOCS_BUCKET } from "@/lib/docs/storage";
import { COMMON_DOCS, type CommonDoc } from "./catalog";

export type CommonDocUploadReport = {
  id: string;
  storagePath: string;
  size: number;
};

async function uploadOne(
  admin: SupabaseClient,
  doc: CommonDoc
): Promise<CommonDocUploadReport> {
  const fsPath = path.join(
    process.cwd(),
    "src",
    "seed",
    "common-docs",
    doc.seedFile
  );
  const buf = await readFile(fsPath);
  const { error } = await admin.storage
    .from(DOCS_BUCKET)
    .upload(doc.storagePath, buf, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (error) {
    throw new Error(
      `Failed to upload common doc ${doc.seedFile}: ${error.message}`
    );
  }
  return {
    id: doc.id,
    storagePath: doc.storagePath,
    size: buf.byteLength,
  };
}

export async function uploadCommonDocs(
  admin: SupabaseClient
): Promise<CommonDocUploadReport[]> {
  return Promise.all(COMMON_DOCS.map((doc) => uploadOne(admin, doc)));
}
