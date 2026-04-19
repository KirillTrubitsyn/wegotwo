/**
 * Resolve the "primary" destination of a trip — the stay-type city
 * whose coordinates should drive the weather chip in the header.
 *
 * Selection rule:
 *   1. Active stay on today's date (date_from <= today <= date_to).
 *   2. Earliest upcoming stay by date_from.
 *   3. Any stay with coordinates, ordered by sort_order / date_from.
 *   4. null when nothing matches.
 *
 * Returns only what the Header component needs: `lat`, `lon`, `tz`,
 * and a short `label` (2–3 letters) for the second clock line.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type HeaderTripCtx = {
  lat: number | null;
  lon: number | null;
  tz: string | null;
  label: string | null;
};

export async function resolveHeaderDestination(
  admin: SupabaseClient,
  tripId: string
): Promise<HeaderTripCtx | null> {
  const { data } = await admin
    .from("destinations")
    .select("id,name,type,lat,lon,timezone,date_from,date_to,sort_order")
    .eq("trip_id", tripId)
    .eq("type", "stay")
    .order("sort_order", { ascending: true })
    .order("date_from", { ascending: true });
  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    type: string | null;
    lat: number | null;
    lon: number | null;
    timezone: string | null;
    date_from: string | null;
    date_to: string | null;
    sort_order: number | null;
  }>;
  if (rows.length === 0) return null;

  const today = new Date().toISOString().slice(0, 10);

  const withCoords = rows.filter(
    (r) => typeof r.lat === "number" && typeof r.lon === "number"
  );
  const pool = withCoords.length > 0 ? withCoords : rows;

  const active = pool.find(
    (r) =>
      r.date_from &&
      r.date_to &&
      r.date_from <= today &&
      today <= r.date_to
  );
  const upcoming = pool.find((r) => r.date_from && r.date_from >= today);
  const picked = active ?? upcoming ?? pool[0];

  const label = picked.name
    ? picked.name.replace(/[^A-Za-zА-Яа-яЁё]/g, "").slice(0, 3).toUpperCase()
    : null;

  return {
    lat: picked.lat ?? null,
    lon: picked.lon ?? null,
    tz: picked.timezone ?? null,
    label,
  };
}
