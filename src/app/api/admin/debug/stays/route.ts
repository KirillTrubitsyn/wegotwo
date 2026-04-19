import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/debug/stays?slug=europe-2026
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Returns the raw jsonb content of stays for a given trip slug. Used
 * to diagnose whether `stays.raw` persisted all Airbnb/Booking details
 * (mapEmbedUrl, mapUrl, confirmationCode, bookingUrl, checkinInstructions,
 * wifi, pin, phone, host, etc.).
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
  const slug = url.searchParams.get("slug") ?? "europe-2026";

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

  const { data: dests } = await admin
    .from("destinations")
    .select("id,name,type,flag_code,photo_path,sort_order,date_from,date_to")
    .eq("trip_id", trip.id)
    .order("sort_order", { ascending: true });

  const { data: stays } = await admin
    .from("stays")
    .select(
      "id,destination_id,title,address,host,host_phone,confirmation,price,currency,raw"
    )
    .eq("trip_id", trip.id);

  return NextResponse.json({
    ok: true,
    trip,
    destinations: dests,
    stays,
  });
}
