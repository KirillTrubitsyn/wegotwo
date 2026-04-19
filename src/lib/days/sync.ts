/**
 * Synchronise the days table with a trip's date range.
 *
 * Strategy:
 *   * Insert a `days` row for every date in [date_from, date_to] that
 *     does not yet exist.
 *   * Update existing rows in place (preserve title, badge, detail, etc.
 *     that the user may have filled in).
 *   * Delete rows outside the new range ONLY when they have no
 *     dependents (no events, places, photos, expenses, receipts).
 *     Rows that carry data stay and become "orphan" days visible only
 *     if the user re-extends the range. This avoids accidental loss
 *     of user content when a trip is shortened.
 *
 * Called from createTripAction and updateTripAction after the trip
 * row is persisted.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type DayRow = {
  id: string;
  trip_id: string;
  date: string;
  date_label: string | null;
  title: string | null;
  badge: string | null;
  badge_type: string | null;
  detail: string | null;
  sort_order: number | null;
};

function dateRange(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  const cur = new Date(fromISO + "T00:00:00Z");
  const end = new Date(toISO + "T00:00:00Z");
  while (cur.getTime() <= end.getTime()) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export async function syncDaysForTrip(
  admin: SupabaseClient,
  tripId: string,
  dateFrom: string,
  dateTo: string
): Promise<void> {
  const wantDates = dateRange(dateFrom, dateTo);
  if (wantDates.length === 0) return;

  // Fetch existing days for the trip
  const { data: existing, error: readErr } = await admin
    .from("days")
    .select("id,date,sort_order")
    .eq("trip_id", tripId);
  if (readErr) throw readErr;

  const have = new Map<string, { id: string; sort_order: number | null }>();
  for (const row of (existing ?? []) as Array<{
    id: string;
    date: string;
    sort_order: number | null;
  }>) {
    have.set(row.date, { id: row.id, sort_order: row.sort_order });
  }

  // Insert missing days with sort_order = index within the range
  const toInsert = wantDates
    .map((date, idx) => ({ date, sort_order: idx }))
    .filter(({ date }) => !have.has(date))
    .map(({ date, sort_order }) => ({
      trip_id: tripId,
      date,
      sort_order,
    }));

  if (toInsert.length > 0) {
    const { error } = await admin.from("days").insert(toInsert);
    if (error) throw error;
  }

  // Reindex sort_order for existing + newly inserted rows so the
  // list renders in chronological order regardless of insertion order.
  const { data: all, error: readAllErr } = await admin
    .from("days")
    .select("id,date")
    .eq("trip_id", tripId)
    .order("date", { ascending: true });
  if (readAllErr) throw readAllErr;

  const rows = (all ?? []) as Array<{ id: string; date: string }>;
  // Only rewrite sort_order if it actually differs to avoid churn.
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const existingRow = have.get(r.date);
    const wantSort = i;
    if (existingRow && existingRow.sort_order === wantSort) continue;
    await admin
      .from("days")
      .update({ sort_order: wantSort })
      .eq("id", r.id);
  }

  // Delete out-of-range days that have no dependents. Events, places,
  // photos, expenses and receipts reference day_id; if any child rows
  // exist, keep the day to avoid data loss.
  const wantSet = new Set(wantDates);
  const outOfRange = rows.filter((r) => !wantSet.has(r.date));
  if (outOfRange.length === 0) return;

  for (const r of outOfRange) {
    const hasChildren = await dayHasChildren(admin, r.id);
    if (!hasChildren) {
      await admin.from("days").delete().eq("id", r.id);
    }
  }
}

async function dayHasChildren(
  admin: SupabaseClient,
  dayId: string
): Promise<boolean> {
  const tables = ["events", "places", "photos", "expenses", "receipts"];
  for (const t of tables) {
    const { count, error } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("day_id", dayId);
    if (error) {
      // Fail safe: treat as having children so we do not delete.
      return true;
    }
    if ((count ?? 0) > 0) return true;
  }
  return false;
}
