import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { DOCS_BUCKET } from "@/lib/docs/storage";
import { parseDocument, type TripContext } from "@/lib/gemini/client";
import { commitParsedDocument } from "@/lib/ingest/commit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini vision-разбор PDF длится 5–30 сек. Ставим 300 — страховка
// на медленный ответ или большие документы. Нужен Vercel Pro.
export const maxDuration = 300;

/**
 * POST /api/trips/{slug}/reparse/one
 * Body: { doc_id: string }
 *
 * Перечитывает один документ через Gemini с актуальным system-
 * prompt, сохраняет новые parsed_fields и прогоняет
 * commitParsedDocument — это обновит связанные events
 * (tour_details, ticket_url, start_at/end_at и т.п.).
 *
 * Клиентская кнопка «🧠» итерирует по списку docId из
 * `/reparse/list` и вызывает этот endpoint по одному, чтобы не
 * упираться в короткий timeout и показывать прогресс N/M.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const username = await getCurrentUsername();
  if (!username) {
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { slug } = await ctx.params;
  const body = await req.json().catch(() => null);
  const docId =
    body && typeof body === "object" && typeof body.doc_id === "string"
      ? body.doc_id
      : null;
  if (!docId) {
    return NextResponse.json(
      { ok: false, error: "doc_id is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  const { data: tripRow } = await admin
    .from("trips")
    .select("id,title,date_from,date_to,base_currency")
    .eq("slug", slug)
    .maybeSingle();
  const t = tripRow as
    | {
        id: string;
        title: string;
        date_from: string;
        date_to: string;
        base_currency: string;
      }
    | null;
  if (!t) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }

  const { data: doc } = await admin
    .from("documents")
    .select("id,storage_path,mime")
    .eq("id", docId)
    .eq("trip_id", t.id)
    .maybeSingle();
  const d = doc as
    | { id: string; storage_path: string; mime: string | null }
    | null;
  if (!d) {
    return NextResponse.json(
      { ok: false, error: "Document not found" },
      { status: 404 }
    );
  }

  try {
    const { data: destsRaw } = await admin
      .from("destinations")
      .select("name,country,flag_code")
      .eq("trip_id", t.id)
      .order("sort_order", { ascending: true });
    const tripCtx: TripContext = {
      title: t.title,
      dateFrom: t.date_from,
      dateTo: t.date_to,
      baseCurrency: t.base_currency,
      destinations: ((destsRaw ?? []) as Array<{
        name: string;
        country: string | null;
        flag_code: string | null;
      }>).map((x) => ({
        name: x.name,
        country: x.country,
        flagCode: x.flag_code,
      })),
    };

    const dl = await admin.storage.from(DOCS_BUCKET).download(d.storage_path);
    if (dl.error || !dl.data) {
      throw new Error(
        dl.error?.message ?? "Не удалось скачать файл документа"
      );
    }
    const buf = new Uint8Array(await dl.data.arrayBuffer());

    const parsed = await parseDocument({
      bytes: buf,
      mime: d.mime ?? "application/pdf",
      trip: tripCtx,
    });

    await admin
      .from("documents")
      .update({
        parsed_fields: parsed,
        parsed_status: "needs_review",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", d.id);

    await commitParsedDocument(admin, {
      tripId: t.id,
      docId: d.id,
      username,
    });

    return NextResponse.json({ ok: true, doc_id: d.id, type: parsed.type });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, doc_id: d.id, error: msg },
      { status: 500 }
    );
  }
}
