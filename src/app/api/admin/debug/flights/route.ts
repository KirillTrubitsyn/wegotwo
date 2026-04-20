import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/debug/flights?slug=<slug>
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Возвращает сырой контент flights + соответствующие documents.parsed_fields.
 * Нужен для диагностики: вытащил ли Gemini оба сегмента round-trip билета
 * или только один. Если `segments` пустой / одноэлементный, но в билете
 * есть обратный рейс — нужно reparse с обновлённым system-prompt либо
 * загрузить отдельный PDF.
 */
export async function GET(req: Request) {
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

  const url = new URL(req.url);
  const slug = url.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "Missing ?slug=" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: trip, error: tErr } = await admin
    .from("trips")
    .select("id,slug,title")
    .eq("slug", slug)
    .maybeSingle();
  if (tErr || !trip) {
    return NextResponse.json(
      { ok: false, error: tErr?.message ?? "Trip not found" },
      { status: 404 }
    );
  }

  const { data: flights } = await admin
    .from("flights")
    .select(
      "id,document_id,airline,code,from_code,to_code,dep_at,arr_at,pnr,seat,baggage,terminal,segments,raw"
    )
    .eq("trip_id", (trip as { id: string }).id);

  const docIds = Array.from(
    new Set(
      ((flights ?? []) as Array<{ document_id: string | null }>)
        .map((f) => f.document_id)
        .filter((x): x is string => !!x)
    )
  );
  const { data: docs } = docIds.length
    ? await admin
        .from("documents")
        .select("id,title,storage_path,kind,parsed_status,parsed_fields")
        .in("id", docIds)
    : { data: [] };

  return NextResponse.json({
    ok: true,
    trip,
    flights,
    documents: docs,
  });
}
