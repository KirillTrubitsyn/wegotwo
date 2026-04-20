/**
 * Autogenerate per-day timeline events from a freshly-committed
 * flight / stay / expense.
 *
 * Events are user-facing timeline cards on the day page. We want
 * ingested documents to "fill in" each day automatically: a flight
 * adds a ✈️ event on the departure date, a stay adds 🔑 check-in
 * and 🧳 check-out events, and expense categories that represent
 * activities (tours, tickets, activities, transport, restaurant)
 * add a themed event on the occurred-on date.
 *
 * Idempotency: we look up an existing event with the same
 * (day_id, kind, start_at, title) tuple and skip the insert when
 * one is found. Re-running ingest is a no-op.
 *
 * Events live in `public.events`. `day_id` is NOT NULL, so we
 * resolve `days.id` by matching `(trip_id, date)` in the trip's
 * local timezone. When the date falls outside the trip range
 * (no matching `days` row) we silently skip — the expense still
 * appears in the budget, just without a timeline card.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  FlightFields,
  StayFields,
  ExpenseFields,
} from "@/lib/gemini/schema";

type TripCtx = { id: string; primary_tz: string };

/**
 * Parse an ISO-8601 date-time string (optional TZ offset) into
 * `{ localDate, iso }` using the trip's primary timezone when the
 * string has no offset. Gemini typically returns naive local times
 * like "2026-05-01T02:55" — we assume those are in the trip TZ.
 */
function localDateInTz(d: Date, tz: string): string {
  // en-CA yields YYYY-MM-DD regardless of locale; split out year/month/day
  // via Intl parts so we never rely on Date(...) parsing locale strings.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${day}`;
}

/**
 * Compute the offset (minutes) of `tz` relative to UTC at the moment `d`.
 * Positive means ahead of UTC. Uses Intl to avoid `new Date(localeString)`
 * which is not reliably parseable in Node.
 */
function tzOffsetMinutes(d: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);
  const get = (t: string) =>
    Number(parts.find((p) => p.type === t)?.value ?? "0");
  const y = get("year");
  const mo = get("month");
  const da = get("day");
  let h = get("hour");
  if (h === 24) h = 0; // Intl sometimes emits "24"
  const mi = get("minute");
  const se = get("second");
  const asUtc = Date.UTC(y, mo - 1, da, h, mi, se);
  return (asUtc - d.getTime()) / 60000;
}

function normalizeDateTime(
  raw: string | null,
  tz: string
): { localDate: string; iso: string } | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return null;

  // Already has an offset → use as-is.
  if (/[+-]\d{2}:?\d{2}$|Z$/.test(s)) {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    return { localDate: localDateInTz(d, tz), iso: d.toISOString() };
  }

  // Naive local → treat as tz-local and derive the UTC instant.
  const datePart = s.slice(0, 10);
  const probe = new Date(`${s}Z`); // pretend the naive string is UTC
  if (isNaN(probe.getTime())) return null;
  const offsetMin = tzOffsetMinutes(probe, tz);
  const utc = new Date(probe.getTime() - offsetMin * 60000);
  return {
    localDate: datePart,
    iso: utc.toISOString(),
  };
}

async function findDay(
  admin: SupabaseClient,
  tripId: string,
  date: string
): Promise<string | null> {
  const { data } = await admin
    .from("days")
    .select("id")
    .eq("trip_id", tripId)
    .eq("date", date)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function insertIfNew(
  admin: SupabaseClient,
  row: {
    trip_id: string;
    day_id: string;
    destination_id: string | null;
    kind: "flight" | "stay" | "activity" | "meal" | "transfer";
    start_at: string | null;
    end_at: string | null;
    title: string;
    notes: string | null;
    emoji: string | null;
    address: string | null;
    sort_order: number;
  }
): Promise<boolean> {
  let q = admin
    .from("events")
    .select("id")
    .eq("trip_id", row.trip_id)
    .eq("day_id", row.day_id)
    .eq("kind", row.kind)
    .eq("title", row.title);
  if (row.start_at) q = q.eq("start_at", row.start_at);
  const { data: exists } = await q.limit(1).maybeSingle();
  if (exists && (exists as { id: string }).id) return false;

  const { error } = await admin.from("events").insert(row);
  if (error) {
    console.error("[events.insertIfNew]", error.message);
    return false;
  }
  return true;
}

export async function createEventsForFlight(
  admin: SupabaseClient,
  trip: TripCtx,
  f: FlightFields
): Promise<number> {
  // Если Gemini вернул segments — создаём событие на каждый сегмент
  // (по дате вылета этого сегмента). Если сегментов нет — падаем на
  // старый путь и создаём одно событие по top-level полям.
  const segs = f.segments ?? [];
  if (segs.length > 0) {
    let count = 0;
    for (const seg of segs) {
      const dep = normalizeDateTime(seg.dep_at, trip.primary_tz);
      const arr = normalizeDateTime(seg.arr_at, trip.primary_tz);
      const anchor = dep ?? arr;
      if (!anchor) continue;
      const dayId = await findDay(admin, trip.id, anchor.localDate);
      if (!dayId) continue;

      const code = seg.code ? ` ${seg.code}` : "";
      const airline = seg.airline ?? f.airline ?? "Рейс";
      const route =
        seg.from_city && seg.to_city
          ? `${seg.from_city} → ${seg.to_city}`
          : seg.from_code && seg.to_code
          ? `${seg.from_code} → ${seg.to_code}`
          : "";
      const title = `${airline}${code}${route ? `: ${route}` : ""}`.trim();
      const notes = [
        f.pnr ? `PNR: ${f.pnr}` : null,
        seg.seat ? `Место: ${seg.seat}` : null,
        seg.terminal ? `Терминал: ${seg.terminal}` : null,
        seg.baggage ? `Багаж: ${seg.baggage}` : null,
      ]
        .filter(Boolean)
        .join(" · ");

      const ok = await insertIfNew(admin, {
        trip_id: trip.id,
        day_id: dayId,
        destination_id: null,
        kind: "flight",
        start_at: dep?.iso ?? null,
        end_at: arr?.iso ?? null,
        title,
        notes: notes || null,
        emoji: "✈️",
        address: null,
        sort_order: 0,
      });
      if (ok) count++;
    }
    return count;
  }

  const dep = normalizeDateTime(f.dep_at, trip.primary_tz);
  const arr = normalizeDateTime(f.arr_at, trip.primary_tz);
  const anchor = dep ?? arr;
  if (!anchor) return 0;
  const dayId = await findDay(admin, trip.id, anchor.localDate);
  if (!dayId) return 0;

  const code = f.code ? ` ${f.code}` : "";
  const airline = f.airline ?? "Рейс";
  const route =
    f.from_city && f.to_city
      ? `${f.from_city} → ${f.to_city}`
      : f.from_code && f.to_code
      ? `${f.from_code} → ${f.to_code}`
      : "";
  const title = `${airline}${code}${route ? `: ${route}` : ""}`.trim();
  const notes = [
    f.pnr ? `PNR: ${f.pnr}` : null,
    f.seat ? `Место: ${f.seat}` : null,
    f.terminal ? `Терминал: ${f.terminal}` : null,
    f.baggage ? `Багаж: ${f.baggage}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const ok = await insertIfNew(admin, {
    trip_id: trip.id,
    day_id: dayId,
    destination_id: null,
    kind: "flight",
    start_at: dep?.iso ?? null,
    end_at: arr?.iso ?? null,
    title,
    notes: notes || null,
    emoji: "✈️",
    address: null,
    sort_order: 0,
  });
  return ok ? 1 : 0;
}

export async function createEventsForStay(
  admin: SupabaseClient,
  trip: TripCtx,
  s: StayFields,
  destinationId: string | null
): Promise<number> {
  let count = 0;
  const checkIn = normalizeDateTime(s.check_in, trip.primary_tz);
  const checkOut = normalizeDateTime(s.check_out, trip.primary_tz);

  const nameLabel = s.title?.trim() || "Проживание";

  if (checkIn) {
    const dayId = await findDay(admin, trip.id, checkIn.localDate);
    if (dayId) {
      const ok = await insertIfNew(admin, {
        trip_id: trip.id,
        day_id: dayId,
        destination_id: destinationId,
        kind: "stay",
        start_at: checkIn.iso,
        end_at: null,
        title: `Заселение: ${nameLabel}`,
        notes: [
          s.confirmation ? `Код: ${s.confirmation}` : null,
          s.host ? `Хозяин: ${s.host}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null,
        emoji: "🔑",
        address: s.address ?? null,
        sort_order: -10,
      });
      if (ok) count++;
    }
  }

  if (checkOut) {
    const dayId = await findDay(admin, trip.id, checkOut.localDate);
    if (dayId) {
      const ok = await insertIfNew(admin, {
        trip_id: trip.id,
        day_id: dayId,
        destination_id: destinationId,
        kind: "stay",
        start_at: checkOut.iso,
        end_at: null,
        title: `Выезд: ${nameLabel}`,
        notes: null,
        emoji: "🧳",
        address: s.address ?? null,
        sort_order: 100,
      });
      if (ok) count++;
    }
  }

  return count;
}

/**
 * Expense categories that should surface on the timeline.
 * Pure receipts (restaurant, transport) and activities all appear;
 * fees/telecom/accommodation/flight are suppressed — fees tend to
 * be payment-processing noise, and accommodation + flight are
 * already covered by stay and flight events.
 */
const ACTIVITY_CATEGORIES: Record<
  string,
  { kind: "activity" | "meal" | "transfer"; emoji: string }
> = {
  tours: { kind: "activity", emoji: "🧭" },
  activities: { kind: "activity", emoji: "🎯" },
  tickets: { kind: "activity", emoji: "🎟️" },
  restaurant: { kind: "meal", emoji: "🍽️" },
  transport: { kind: "transfer", emoji: "🚕" },
};

export async function createEventsForExpense(
  admin: SupabaseClient,
  trip: TripCtx,
  e: ExpenseFields
): Promise<number> {
  if (!e.occurred_on || !e.category) return 0;
  const kindInfo = ACTIVITY_CATEGORIES[e.category];
  if (!kindInfo) return 0;

  const dayId = await findDay(admin, trip.id, e.occurred_on);
  if (!dayId) return 0;

  const title = e.description?.trim() || e.merchant?.trim() || "Событие";
  const notes = e.merchant && e.description ? e.merchant : null;

  const ok = await insertIfNew(admin, {
    trip_id: trip.id,
    day_id: dayId,
    destination_id: null,
    kind: kindInfo.kind,
    start_at: null,
    end_at: null,
    title,
    notes,
    emoji: kindInfo.emoji,
    address: null,
    sort_order: 10,
  });
  return ok ? 1 : 0;
}
