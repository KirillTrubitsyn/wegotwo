import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DOCS_BUCKET,
  sha256Hex,
  storagePathFor,
} from "@/lib/docs/storage";
import { extForMime } from "@/lib/docs/labels";
import { parseDocument, type TripContext } from "@/lib/gemini/client";
import { commitParsedDocument } from "@/lib/ingest/commit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/admin/ingest
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *   Content-Type: application/json
 *   Body:
 *     {
 *       trip_slug: "europe-2026",
 *       file_name: "booking.pdf",
 *       mime:      "application/pdf",
 *       file_base64: "JVBERi0xL..."  // raw bytes, no data: prefix
 *       title?:    "Airbnb Paris",
 *       username?: "kirill",
 *       commit?:   true             // if true, also write flight/stay/expense
 *     }
 *
 * Creates a `documents` row, runs Gemini parsing, returns the
 * structured `parsed_fields`. When `commit=true` and the document
 * classifies as flight/stay/expense, also writes the matching row.
 *
 * Alternative: to re-analyze an already-uploaded document, pass
 * `{ trip_slug, doc_id }` and omit `file_base64`.
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
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  type Body = {
    trip_slug?: string;
    doc_id?: string;
    file_name?: string;
    mime?: string;
    file_base64?: string;
    title?: string;
    username?: string;
    commit?: boolean;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const slug = body.trip_slug?.trim();
  if (!slug) {
    return NextResponse.json(
      { ok: false, error: "trip_slug is required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,date_from,date_to,base_currency")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) {
    return NextResponse.json({ ok: false, error: "Trip not found" }, { status: 404 });
  }
  const trip = tripData as {
    id: string;
    title: string;
    date_from: string;
    date_to: string;
    base_currency: string;
  };

  // Two modes: by doc_id, or by new upload.
  let docId: string;
  let bytes: Uint8Array;
  let mime: string;

  if (body.doc_id) {
    docId = body.doc_id;
    const { data: doc } = await admin
      .from("documents")
      .select("id,storage_path,mime")
      .eq("id", docId)
      .eq("trip_id", trip.id)
      .maybeSingle();
    const row = doc as { id: string; storage_path: string; mime: string | null } | null;
    if (!row) {
      return NextResponse.json(
        { ok: false, error: "Document not found" },
        { status: 404 }
      );
    }
    const dl = await admin.storage.from(DOCS_BUCKET).download(row.storage_path);
    if (dl.error || !dl.data) {
      return NextResponse.json(
        { ok: false, error: dl.error?.message ?? "Download failed" },
        { status: 500 }
      );
    }
    bytes = new Uint8Array(await dl.data.arrayBuffer());
    mime = row.mime ?? "application/octet-stream";
  } else {
    if (!body.file_base64 || !body.mime) {
      return NextResponse.json(
        { ok: false, error: "file_base64 and mime are required when doc_id is absent" },
        { status: 400 }
      );
    }
    const buf = Buffer.from(body.file_base64, "base64");
    if (buf.byteLength === 0) {
      return NextResponse.json(
        { ok: false, error: "file_base64 decodes to empty" },
        { status: 400 }
      );
    }
    if (buf.byteLength > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, error: "File too large (25 MB limit)" },
        { status: 400 }
      );
    }
    bytes = new Uint8Array(buf);
    mime = body.mime;

    // Copy into a fresh ArrayBuffer to satisfy sha256Hex's non-shared contract.
    const hashBuf = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(hashBuf).set(bytes);
    const hash = await sha256Hex(hashBuf);

    // Dedup by (trip_id, content_hash).
    const { data: exists } = await admin
      .from("documents")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("content_hash", hash)
      .maybeSingle();
    if ((exists as { id: string } | null)?.id) {
      docId = (exists as { id: string }).id;
    } else {
      const id =
        typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "";
      if (!id) {
        return NextResponse.json(
          { ok: false, error: "Cannot generate uuid" },
          { status: 500 }
        );
      }
      const ext = extForMime(mime, "bin");
      const storagePath = storagePathFor(trip.id, id, ext);
      const up = await admin.storage
        .from(DOCS_BUCKET)
        .upload(storagePath, bytes, { contentType: mime, upsert: false });
      if (up.error) {
        return NextResponse.json(
          { ok: false, error: up.error.message },
          { status: 500 }
        );
      }
      const { error: insErr } = await admin.from("documents").insert({
        id,
        trip_id: trip.id,
        kind: "other",
        title: body.title?.trim() || body.file_name || "Документ из Cowork",
        storage_path: storagePath,
        size_bytes: bytes.byteLength,
        mime,
        content_hash: hash,
        source: "cowork",
        uploaded_by_username: body.username ?? null,
      });
      if (insErr) {
        await admin.storage.from(DOCS_BUCKET).remove([storagePath]);
        return NextResponse.json(
          { ok: false, error: insErr.message },
          { status: 500 }
        );
      }
      docId = id;
    }
  }

  // Load trip context for Gemini.
  const { data: dests } = await admin
    .from("destinations")
    .select("name,country,flag_code")
    .eq("trip_id", trip.id)
    .order("sort_order", { ascending: true });
  const ctx: TripContext = {
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

  const logIns = await admin
    .from("cowork_ingest_log")
    .insert({
      trip_id: trip.id,
      action: "ingest",
      files: [{ doc_id: docId, via: body.doc_id ? "re-analyze" : "upload" }],
      status: "started",
    })
    .select("id")
    .single();
  const logId = (logIns.data as { id: string } | null)?.id ?? null;

  try {
    const parsed = await parseDocument({ bytes, mime, trip: ctx });

    await admin
      .from("documents")
      .update({
        parsed_fields: parsed,
        parsed_status: "needs_review",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", docId);

    let commitInfo: unknown = null;
    if (body.commit && parsed.type !== "unknown") {
      const c = await commitParsedDocument(admin, {
        tripId: trip.id,
        docId,
        username: body.username ?? null,
      });
      commitInfo = c;
    }

    if (logId) {
      await admin
        .from("cowork_ingest_log")
        .update({
          status: "success",
          ended_at: new Date().toISOString(),
          gemini_usage: { type: parsed.type, summary: parsed.summary },
        })
        .eq("id", logId);
    }

    return NextResponse.json({
      ok: true,
      doc_id: docId,
      parsed,
      commit: commitInfo,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("documents")
      .update({
        parsed_status: "failed",
        parsed_at: new Date().toISOString(),
        parsed_fields: { error: msg },
      })
      .eq("id", docId);
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
    return NextResponse.json(
      { ok: false, error: msg, doc_id: docId },
      { status: 500 }
    );
  }
}
