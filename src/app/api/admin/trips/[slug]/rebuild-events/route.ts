import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createEventsForFlight,
  createEventsForStay,
  createEventsForExpense,
} from "@/lib/ingest/events";
import type {
  FlightFields,
  StayFields,
  ExpenseFields,
} from "@/lib/gemini/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/admin/trips/{slug}/rebuild-events
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Walks all flights, stays and expenses for the trip and inserts
 * corresponding timeline events on the matching days. Idempotent:
 * events with the same (day_id, kind, start_at, title) tuple are
 * skipped.
 *
 * Useful to backfill timelines for trips that were ingested before
 * auto-event generation was added to the commit pipeline.
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
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

  const { slug } = await ctx.params;
  const admin = createAdminClient();

  const { data: tripRow } = await admin
    .from("trips")
    .select("id,primary_tz")
    .eq("slug", slug)
    .maybeSingle();
  const trip = tripRow as { id: string; primary_tz: string } | null;
  if (!trip) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }

  const tripCtx = { id: trip.id, primary_tz: trip.primary_tz };

  // Flights
  const { data: flightRows } = await admin
    .from("flights")
    .select(
      "id,airline,code,from_code,from_city,to_code,to_city,dep_at,arr_at,seat,pnr,baggage,terminal"
    )
    .eq("trip_id", trip.id);
  let flightEvents = 0;
  for (const r of (flightRows ?? []) as Array<FlightFields>) {
    flightEvents += await createEventsForFlight(admin, tripCtx, r);
  }

  // Stays
  const { data: stayRows } = await admin
    .from("stays")
    .select(
      "id,destination_id,title,address,check_in,check_out,host,host_phone,confirmation,price,currency"
    )
    .eq("trip_id", trip.id);
  let stayEvents = 0;
  type StayRow = Omit<StayFields, "country_code"> & {
    destination_id: string | null;
  };
  for (const r of (stayRows ?? []) as StayRow[]) {
    const fields: StayFields = {
      title: r.title,
      address: r.address,
      check_in: r.check_in,
      check_out: r.check_out,
      host: r.host,
      host_phone: r.host_phone,
      confirmation: r.confirmation,
      price: typeof r.price === "string" ? Number(r.price) : r.price,
      currency: r.currency,
      country_code: null,
    };
    stayEvents += await createEventsForStay(
      admin,
      tripCtx,
      fields,
      r.destination_id
    );
  }

  // Expenses
  const { data: expRows } = await admin
    .from("expenses")
    .select("id,merchant,description,occurred_on,amount_original,currency_original,category")
    .eq("trip_id", trip.id);
  let expenseEvents = 0;
  for (const r of (expRows ?? []) as Array<{
    merchant: string | null;
    description: string | null;
    occurred_on: string | null;
    amount_original: number | string;
    currency_original: string;
    category: string;
  }>) {
    const fields: ExpenseFields = {
      merchant: r.merchant,
      description: r.description,
      occurred_on: r.occurred_on,
      amount:
        typeof r.amount_original === "string"
          ? Number(r.amount_original)
          : r.amount_original,
      currency: r.currency_original,
      category: r.category as ExpenseFields["category"],
    };
    expenseEvents += await createEventsForExpense(admin, tripCtx, fields);
  }

  return NextResponse.json({
    ok: true,
    trip_id: trip.id,
    created: {
      flights: flightEvents,
      stays: stayEvents,
      expenses: expenseEvents,
    },
  });
}
