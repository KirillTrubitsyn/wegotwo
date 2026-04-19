import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncDaysForTrip } from "@/lib/days/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/admin/trips
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *   Content-Type: application/json
 *
 * Idempotent upsert by `trips.slug`. When a `destinations` array is
 * supplied, each destination is upserted by `(trip_id, name)`: existing
 * rows are patched in place so foreign keys from `stays.destination_id`
 * and `events.destination_id` stay intact. Extra destinations that are
 * not mentioned in the request are preserved (no wipe).
 *
 * Destinations accept optional `lat`, `lon`, `timezone` which the
 * trip header uses for the per-city weather chip.
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

  type DestInput = {
    name?: string;
    country?: string | null;
    flag_code?: string | null;
    type?: string | null;
    date_from?: string | null;
    date_to?: string | null;
    sort_order?: number | null;
    lat?: number | null;
    lon?: number | null;
    timezone?: string | null;
  };
  type Body = {
    slug?: string;
    title?: string;
    subtitle?: string | null;
    country?: string | null;
    date_from?: string;
    date_to?: string;
    base_currency?: string;
    primary_tz?: string;
    color?: string;
    route_summary?: string | null;
    username?: string;
    destinations?: DestInput[];
  };

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const slug = body.slug?.trim().toLowerCase();
  const title = body.title?.trim();
  const dateFrom = body.date_from?.trim();
  const dateTo = body.date_to?.trim();
  const baseCurrency = body.base_currency?.trim().toUpperCase() ?? "EUR";
  const primaryTz = body.primary_tz?.trim() ?? "Europe/Moscow";
  const color = body.color?.trim() ?? "blue";
  const username = body.username?.trim() || "kirill";

  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return NextResponse.json(
      { ok: false, error: "slug must be lowercase kebab-case" },
      { status: 400 }
    );
  }
  if (!title || title.length < 2) {
    return NextResponse.json(
      { ok: false, error: "title is required" },
      { status: 400 }
    );
  }
  if (!dateFrom || !/^\d{4}-\d{2}-\d{2}$/.test(dateFrom)) {
    return NextResponse.json(
      { ok: false, error: "date_from must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (!dateTo || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    return NextResponse.json(
      { ok: false, error: "date_to must be YYYY-MM-DD" },
      { status: 400 }
    );
  }
  if (dateFrom > dateTo) {
    return NextResponse.json(
      { ok: false, error: "date_from > date_to" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Upsert trip row by slug.
  const { data: existing } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  const tripPayload = {
    title,
    slug,
    subtitle: body.subtitle ?? null,
    country: body.country ?? null,
    date_from: dateFrom,
    date_to: dateTo,
    base_currency: baseCurrency,
    primary_tz: primaryTz,
    color,
    route_summary: body.route_summary ?? null,
    created_by_username: username,
  };

  let tripId: string;
  if (existing && (existing as { id: string }).id) {
    tripId = (existing as { id: string }).id;
    const { error } = await admin
      .from("trips")
      .update(tripPayload)
      .eq("id", tripId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }
  } else {
    const { data: ins, error } = await admin
      .from("trips")
      .insert(tripPayload)
      .select("id")
      .single();
    if (error || !ins) {
      return NextResponse.json(
        { ok: false, error: error?.message ?? "Insert failed" },
        { status: 500 }
      );
    }
    tripId = (ins as { id: string }).id;
  }

  // Destinations: upsert by (trip_id, name). Preserves child FKs.
  let destinationsUpserted = 0;
  if (Array.isArray(body.destinations) && body.destinations.length > 0) {
    for (let i = 0; i < body.destinations.length; i++) {
      const d = body.destinations[i];
      const name = d.name?.trim();
      if (!name) continue;
      const payload = {
        trip_id: tripId,
        name,
        country: d.country ?? null,
        flag_code: d.flag_code ? d.flag_code.toLowerCase() : null,
        type: d.type ?? "stay",
        date_from: d.date_from ?? null,
        date_to: d.date_to ?? null,
        sort_order: d.sort_order ?? i,
        lat: typeof d.lat === "number" ? d.lat : null,
        lon: typeof d.lon === "number" ? d.lon : null,
        timezone: d.timezone ?? null,
      };

      const { data: dest } = await admin
        .from("destinations")
        .select("id")
        .eq("trip_id", tripId)
        .eq("name", name)
        .maybeSingle();

      if (dest && (dest as { id: string }).id) {
        const { error } = await admin
          .from("destinations")
          .update(payload)
          .eq("id", (dest as { id: string }).id);
        if (error) {
          return NextResponse.json(
            { ok: false, error: `destinations: ${error.message}` },
            { status: 500 }
          );
        }
      } else {
        const { error } = await admin.from("destinations").insert(payload);
        if (error) {
          return NextResponse.json(
            { ok: false, error: `destinations: ${error.message}` },
            { status: 500 }
          );
        }
      }
      destinationsUpserted++;
    }
  }

  // Ensure days exist for the date range.
  let daysCount = 0;
  try {
    await syncDaysForTrip(admin, tripId, dateFrom, dateTo);
    const { count } = await admin
      .from("days")
      .select("id", { count: "exact", head: true })
      .eq("trip_id", tripId);
    daysCount = count ?? 0;
  } catch (e) {
    console.error("[/api/admin/trips] syncDaysForTrip failed:", e);
  }

  return NextResponse.json({
    ok: true,
    trip: { id: tripId, slug, title, date_from: dateFrom, date_to: dateTo },
    destinations: destinationsUpserted,
    days: daysCount,
  });
}
