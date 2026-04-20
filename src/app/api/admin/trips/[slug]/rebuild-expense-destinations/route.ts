import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  fetchStayDestinations,
  pickDestinationForDate,
} from "@/lib/trips/destinations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * POST /api/admin/trips/{slug}/rebuild-expense-destinations
 *   Authorization: Bearer <WGT_INGEST_TOKEN>
 *
 * Проставляет expenses.destination_id для всех расходов поездки,
 * у которых он пустой: для каждого expense.occurred_on выбирает
 * stay-destination с пересекающимся диапазоном date_from..date_to.
 *
 * Идемпотентно: повторный запуск не трогает уже назначенные
 * расходы (`destination_id is null` в where-фильтре). Возвращает
 * { matched, updated, unmatched } для диагностики.
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

  const { data: tripRow, error: tripErr } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (tripErr) {
    return NextResponse.json(
      { ok: false, stage: "trip", error: tripErr.message },
      { status: 500 }
    );
  }
  if (!tripRow) {
    return NextResponse.json(
      { ok: false, error: "Trip not found" },
      { status: 404 }
    );
  }
  const tripId = (tripRow as { id: string }).id;

  const dests = await fetchStayDestinations(admin, tripId);

  // Перебираем только расходы без destination_id. Если у пользователя
  // уже был проставлен город вручную, повторный ingest его не перезаписывает.
  const { data: expRows, error: expErr } = await admin
    .from("expenses")
    .select("id,occurred_on")
    .eq("trip_id", tripId)
    .is("destination_id", null);
  if (expErr) {
    return NextResponse.json(
      { ok: false, stage: "expenses:select", error: expErr.message },
      { status: 500 }
    );
  }
  const rows = (expRows ?? []) as Array<{
    id: string;
    occurred_on: string | null;
  }>;

  let updated = 0;
  let unmatched = 0;
  for (const r of rows) {
    const destId = pickDestinationForDate(dests, r.occurred_on);
    if (!destId) {
      unmatched += 1;
      continue;
    }
    const { error } = await admin
      .from("expenses")
      .update({ destination_id: destId })
      .eq("id", r.id);
    if (error) {
      return NextResponse.json(
        {
          ok: false,
          stage: "expenses:update",
          error: error.message,
          row: r,
        },
        { status: 500 }
      );
    }
    updated += 1;
  }

  return NextResponse.json({
    ok: true,
    trip_id: tripId,
    matched: rows.length,
    updated,
    unmatched,
    destinations: dests.length,
  });
}
