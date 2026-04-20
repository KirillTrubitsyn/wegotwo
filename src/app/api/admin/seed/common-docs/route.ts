import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadCommonDocs } from "@/lib/common-docs/upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/admin/seed/common-docs
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Uploads passports and other shared-across-trips documents from
 * `src/seed/common-docs/` into the private `documents` Supabase
 * Storage bucket under `common/*.pdf`. Idempotent (upsert).
 */
export async function POST(req: Request) {
  const expected = process.env.WGT_INGEST_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "WGT_INGEST_TOKEN is not configured on the server" },
      { status: 500 }
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match || match[1] !== expected) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const admin = createAdminClient();
    const report = await uploadCommonDocs(admin);
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[seed/common-docs] error", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
