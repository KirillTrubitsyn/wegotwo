"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { DOCS_BUCKET } from "@/lib/docs/storage";
import { parseDocument, type TripContext } from "@/lib/gemini/client";
import { commitParsedDocument } from "@/lib/ingest/commit";

export type IngestState =
  | { ok: true; message?: string }
  | { ok: false; error: string };

async function resolveTripAndDoc(slug: string, docId: string) {
  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id,slug,title,date_from,date_to,base_currency")
    .eq("slug", slug)
    .maybeSingle();
  if (!trip) return { admin, trip: null, doc: null };
  const t = trip as {
    id: string;
    slug: string;
    title: string;
    date_from: string;
    date_to: string;
    base_currency: string;
  };

  const { data: doc } = await admin
    .from("documents")
    .select("id,storage_path,mime,parsed_status,parsed_fields")
    .eq("id", docId)
    .eq("trip_id", t.id)
    .maybeSingle();
  if (!doc) return { admin, trip: t, doc: null };

  return {
    admin,
    trip: t,
    doc: doc as {
      id: string;
      storage_path: string;
      mime: string | null;
      parsed_status: string | null;
      parsed_fields: unknown;
    },
  };
}

async function loadTripContext(
  admin: ReturnType<typeof createAdminClient>,
  tripId: string,
  trip: { title: string; date_from: string; date_to: string; base_currency: string }
): Promise<TripContext> {
  const { data: dests } = await admin
    .from("destinations")
    .select("name,country,flag_code")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  return {
    title: trip.title,
    dateFrom: trip.date_from,
    dateTo: trip.date_to,
    baseCurrency: trip.base_currency,
    destinations: ((dests ?? []) as {
      name: string;
      country: string | null;
      flag_code: string | null;
    }[]).map((d) => ({
      name: d.name,
      country: d.country,
      flagCode: d.flag_code,
    })),
  };
}

export async function analyzeDocumentAction(
  slug: string,
  docId: string,
  _prev: IngestState,
  _fd: FormData
): Promise<IngestState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const { admin, trip, doc } = await resolveTripAndDoc(slug, docId);
  if (!trip) return { ok: false, error: "Поездка не найдена" };
  if (!doc) return { ok: false, error: "Документ не найден" };

  const log = await admin
    .from("cowork_ingest_log")
    .insert({
      trip_id: trip.id,
      action: "plan",
      files: [{ doc_id: doc.id }],
      status: "started",
    })
    .select("id")
    .single();
  const logId = (log.data as { id: string } | null)?.id ?? null;

  try {
    const dl = await admin.storage.from(DOCS_BUCKET).download(doc.storage_path);
    if (dl.error || !dl.data) {
      throw new Error(dl.error?.message ?? "Не удалось скачать файл из Storage");
    }
    const buf = new Uint8Array(await dl.data.arrayBuffer());

    const ctx = await loadTripContext(admin, trip.id, trip);
    const parsed = await parseDocument({
      bytes: buf,
      mime: doc.mime ?? "application/pdf",
      trip: ctx,
    });

    const { error: updErr } = await admin
      .from("documents")
      .update({
        parsed_fields: parsed,
        parsed_status:
          parsed.type === "unknown" ? "needs_review" : "needs_review",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", doc.id);
    if (updErr) throw new Error(updErr.message);

    if (logId) {
      await admin
        .from("cowork_ingest_log")
        .update({
          status: "success",
          ended_at: new Date().toISOString(),
          gemini_usage: { summary: parsed.summary, type: parsed.type },
        })
        .eq("id", logId);
    }

    revalidatePath(`/trips/${slug}/docs/${docId}`);
    return { ok: true, message: parsed.summary };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (logId) {
      await admin
        .from("cowork_ingest_log")
        .update({
          status: "failed",
          error: msg,
          ended_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    await admin
      .from("documents")
      .update({
        parsed_status: "failed",
        parsed_at: new Date().toISOString(),
        parsed_fields: { error: msg },
      })
      .eq("id", doc.id);
    return { ok: false, error: msg };
  }
}

export async function commitIngestAction(
  slug: string,
  docId: string,
  _prev: IngestState,
  _fd: FormData
): Promise<IngestState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const { admin, trip, doc } = await resolveTripAndDoc(slug, docId);
  if (!trip) return { ok: false, error: "Поездка не найдена" };
  if (!doc) return { ok: false, error: "Документ не найден" };

  const logIns = await admin
    .from("cowork_ingest_log")
    .insert({
      trip_id: trip.id,
      action: "ingest",
      files: [{ doc_id: doc.id }],
      status: "started",
    })
    .select("id")
    .single();
  const logId = (logIns.data as { id: string } | null)?.id ?? null;

  const result = await commitParsedDocument(admin, {
    tripId: trip.id,
    docId: doc.id,
    username,
  });

  if (!result.ok) {
    if (logId) {
      await admin
        .from("cowork_ingest_log")
        .update({
          status: "failed",
          error: result.error,
          ended_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return { ok: false, error: result.error };
  }

  if (logId) {
    await admin
      .from("cowork_ingest_log")
      .update({
        status: "success",
        ended_at: new Date().toISOString(),
        files: [
          { doc_id: doc.id, kind: result.kind, row_id: result.rowId, created: result.created },
        ],
      })
      .eq("id", logId);
  }

  revalidatePath(`/trips/${slug}/docs/${docId}`);
  revalidatePath(`/trips/${slug}/docs`);
  revalidatePath(`/trips/${slug}`);
  if (result.kind === "expense") revalidatePath(`/trips/${slug}/budget`);
  return {
    ok: true,
    message: result.created
      ? `Создано: ${kindLabelRu(result.kind)}`
      : `Уже привязано к документу: ${kindLabelRu(result.kind)}`,
  };
}

export async function clearIngestAction(
  slug: string,
  docId: string,
  _prev: IngestState,
  _fd: FormData
): Promise<IngestState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, error: "Требуется вход" };

  const { admin, trip, doc } = await resolveTripAndDoc(slug, docId);
  if (!trip) return { ok: false, error: "Поездка не найдена" };
  if (!doc) return { ok: false, error: "Документ не найден" };

  await admin
    .from("documents")
    .update({
      parsed_status: "skipped",
      parsed_at: new Date().toISOString(),
    })
    .eq("id", doc.id);

  revalidatePath(`/trips/${slug}/docs/${docId}`);
  return { ok: true, message: "Отмечено как не требующее ингеста" };
}

function kindLabelRu(
  k: "flight" | "stay" | "expense" | "city_summary"
): string {
  switch (k) {
    case "flight":
      return "рейс";
    case "stay":
      return "бронь проживания";
    case "expense":
      return "расход";
    case "city_summary":
      return "описание города";
  }
}
