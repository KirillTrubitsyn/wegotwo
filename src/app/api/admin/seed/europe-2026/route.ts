import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { seedEurope2026 } from "@/lib/seed/europe-2026";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/seed/europe-2026
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *   Body: optional { username?: string } (defaults to "kirill")
 *
 * Seeds the europe-2026 trip row with destinations, days, events,
 * flights, stays, and a handful of known expenses. Idempotent: runs
 * as upsert on the trip and wipe-and-reinsert on child tables.
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

  let username = "kirill";
  try {
    const body = await req.json().catch(() => ({}));
    if (body && typeof body.username === "string" && body.username.trim()) {
      username = body.username.trim();
    }
  } catch {
    // Empty body is fine.
  }

  try {
    const admin = createAdminClient();
    const report = await seedEurope2026(admin, { username });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[seed/europe-2026] error", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
