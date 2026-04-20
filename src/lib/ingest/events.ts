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
import { mapEmbedUrl, mapSearchUrl } from "@/lib/travel/maps";
import { parseGoogleMapsCoords } from "@/lib/travel/gmaps-url";
import { detectStayProvider } from "@/lib/travel/airbnb";
import { lookupAirline } from "@/lib/travel/airlines";
import { lookupAirport } from "@/lib/travel/airports";
import { refreshDayDetail } from "@/lib/ingest/day-detail";

type TripCtx = { id: string; primary_tz: string };

type EventLink = {
  label: string;
  url: string;
  icon?: string;
  kind?: "primary" | "board" | "map" | "phone" | "other";
};

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

type TourExtraRow = {
  label: string;
  amount: number | null;
  currency: string | null;
};

type TourDetailsRow = {
  guide_name?: string | null;
  guide_phone?: string | null;
  paid_amount?: number | null;
  paid_currency?: string | null;
  due_amount?: number | null;
  due_currency?: string | null;
  extras?: TourExtraRow[];
};

type EventRow = {
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
  map_url: string | null;
  website: string | null;
  phone: string | null;
  booking_url: string | null;
  map_embed_url: string | null;
  links: EventLink[];
  description?: string | null;
  tour_details?: TourDetailsRow | null;
  ticket_url?: string | null;
};

/**
 * Insert the event if no (day_id, kind, start_at, title) match exists.
 * Otherwise UPDATE the existing row in place — ingest is idempotent,
 * but we still want to pick up any new fields (map_url, booking_url,
 * links, notes) that a later pass populated, e.g. when the dedup
 * logic merged two stay documents into one.
 */
async function upsertEvent(
  admin: SupabaseClient,
  row: EventRow
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

  if (exists && (exists as { id: string }).id) {
    const id = (exists as { id: string }).id;
    // Patch only "enrichment" fields — we never overwrite a user's
    // manual edit of title / notes from the UI (the UI updates
    // through updateEventAction which goes through actions.ts).
    const patch: Record<string, unknown> = {
      map_url: row.map_url,
      website: row.website,
      phone: row.phone,
      booking_url: row.booking_url,
      map_embed_url: row.map_embed_url,
      links: row.links,
      address: row.address,
      emoji: row.emoji,
    };
    // `notes` carries bookkeeping like "Код · Хозяин · Оплачено". We
    // regenerate it on every ingest so price / host updates appear.
    if (row.notes) patch.notes = row.notes;
    // Phase 16 tour fields: only PATCH the structured tour_details /
    // ticket_url; we never overwrite a non-empty `description` with
    // an empty one, because the long-form description is usually
    // filled by the user manually (scraped from Tripster) and the
    // ingest layer won't know how to regenerate it.
    if (row.ticket_url !== undefined) patch.ticket_url = row.ticket_url;
    if (row.tour_details !== undefined) patch.tour_details = row.tour_details;
    if (row.description != null && row.description !== "")
      patch.description = row.description;
    const updRes = await updateEventCompat(admin, id, patch);
    if (updRes.error)
      console.error("[events.upsertEvent] update:", updRes.error);
    return false;
  }

  const insRes = await insertEventCompat(admin, row);
  if (insRes.error) {
    console.error("[events.upsertEvent] insert:", insRes.error);
    return false;
  }
  return true;
}

/**
 * Phase 14 добавил `events.booking_url`, `events.map_embed_url`,
 * `events.links`. Если миграция ещё не накатилась, пробуем второй
 * раз без этих полей — чтобы не ронять весь ingest из-за незнакомой
 * колонки. Аналогично для update.
 */
const EXTENDED_COLUMNS = [
  // phase14
  "booking_url",
  "map_embed_url",
  "links",
  // phase16 (tours)
  "description",
  "tour_details",
  "ticket_url",
] as const;

async function insertEventCompat(
  admin: SupabaseClient,
  row: EventRow
): Promise<{ error?: string }> {
  const { error } = await admin.from("events").insert(row);
  if (!error) return {};
  if (isUnknownColumnError(error.message, EXTENDED_COLUMNS)) {
    const stripped: Record<string, unknown> = { ...row };
    for (const c of EXTENDED_COLUMNS) delete stripped[c];
    const { error: retry } = await admin.from("events").insert(stripped);
    if (!retry) return {};
    return { error: retry.message };
  }
  return { error: error.message };
}

async function updateEventCompat(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>
): Promise<{ error?: string }> {
  const { error } = await admin.from("events").update(patch).eq("id", id);
  if (!error) return {};
  if (isUnknownColumnError(error.message, EXTENDED_COLUMNS)) {
    const stripped: Record<string, unknown> = { ...patch };
    for (const c of EXTENDED_COLUMNS) delete stripped[c];
    const { error: retry } = await admin
      .from("events")
      .update(stripped)
      .eq("id", id);
    if (!retry) return {};
    return { error: retry.message };
  }
  return { error: error.message };
}

function isUnknownColumnError(
  msg: string,
  cols: readonly string[]
): boolean {
  // PostgREST: 'column "xxx" of relation "events" does not exist'
  // Supabase sometimes phrases it as "Could not find the 'xxx' column".
  const lower = msg.toLowerCase();
  return cols.some(
    (c) =>
      lower.includes(`column "${c}"`) ||
      lower.includes(`'${c}' column`) ||
      lower.includes(`"${c}" of relation`)
  );
}

function buildFlightLinks(
  airline: string | null | undefined,
  code: string | null | undefined,
  fromCode: string | null | undefined,
  toCode: string | null | undefined
): {
  website: string | null;
  phone: string | null;
  links: EventLink[];
} {
  const links: EventLink[] = [];
  const carrier = lookupAirline(airline ?? null, code ?? null);
  const from = lookupAirport(fromCode ?? null);
  const to = lookupAirport(toCode ?? null);

  if (carrier) {
    links.push({
      label: carrier.names[0],
      url: carrier.manageUrl ?? carrier.url,
      icon: "✈",
      kind: "primary",
    });
  }
  if (from) {
    links.push({
      label: `Табло ${from.name}`,
      url: from.boardUrl,
      icon: "📋",
      kind: "board",
    });
  }
  if (to) {
    links.push({
      label: `Табло ${to.name}`,
      url: to.boardUrl,
      icon: "📋",
      kind: "board",
    });
  }

  return {
    website: carrier?.url ?? null,
    phone: carrier?.phone ?? null,
    links,
  };
}

export async function createEventsForFlight(
  admin: SupabaseClient,
  trip: TripCtx,
  f: FlightFields
): Promise<number> {
  const affected: string[] = [];
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
      const extras = buildFlightLinks(
        seg.airline ?? f.airline,
        seg.code ?? f.code,
        seg.from_code,
        seg.to_code
      );

      const ok = await upsertEvent(admin, {
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
        map_url: null,
        website: extras.website,
        phone: extras.phone,
        booking_url: null,
        map_embed_url: null,
        links: extras.links,
      });
      if (ok) count++;
      affected.push(dayId);
    }
    for (const dayId of new Set(affected))
      await refreshDayDetail(admin, dayId);
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
  const extras = buildFlightLinks(f.airline, f.code, f.from_code, f.to_code);

  const ok = await upsertEvent(admin, {
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
    map_url: null,
    website: extras.website,
    phone: extras.phone,
    booking_url: null,
    map_embed_url: null,
    links: extras.links,
  });
  await refreshDayDetail(admin, dayId);
  return ok ? 1 : 0;
}

function formatPrice(
  amount: number | null | undefined,
  currency: string | null | undefined
): string | null {
  if (amount == null) return null;
  const num = Number(amount);
  if (!Number.isFinite(num)) return null;
  const formatted = num.toLocaleString("ru-RU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

/**
 * Format "HH:MM" in the trip's timezone — used to put a concrete
 * check-in / check-out time into the event notes without depending
 * on the rendering layer.
 */
function formatLocalTime(iso: string | null, tz: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat("ru-RU", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const h = parts.find((p) => p.type === "hour")?.value ?? "00";
  const m = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${h}:${m}`;
}

export async function createEventsForStay(
  admin: SupabaseClient,
  trip: TripCtx,
  s: StayFields & {
    lat?: number | null;
    lon?: number | null;
    booking_url?: string | null;
    map_url?: string | null;
  },
  destinationId: string | null
): Promise<number> {
  let count = 0;
  const checkIn = normalizeDateTime(s.check_in, trip.primary_tz);
  const checkOut = normalizeDateTime(s.check_out, trip.primary_tz);

  const nameLabel = s.title?.trim() || "Проживание";
  const address = s.address ?? null;
  // Если пользователь вручную задал ссылку на Google Maps, берём
  // координаты из неё (точный пин POI). Иначе используем lat/lon
  // из документа бронирования, иначе — адрес строкой.
  const parsedCoords = parseGoogleMapsCoords(s.map_url ?? null);
  const lat = s.lat ?? parsedCoords?.lat ?? null;
  const lon = s.lon ?? parsedCoords?.lon ?? null;
  const mapUrl = s.map_url ?? mapSearchUrl(address, lat, lon);
  const mapEmbed = mapEmbedUrl(address, lat, lon);
  const provider =
    (s.booking_url && { label: "Бронирование", url: s.booking_url }) ||
    detectStayProvider(s.confirmation);
  const bookingUrl = provider?.url ?? null;

  const priceLabel = formatPrice(s.price, s.currency);
  const checkInTime = formatLocalTime(checkIn?.iso ?? null, trip.primary_tz);
  const checkOutTime = formatLocalTime(checkOut?.iso ?? null, trip.primary_tz);

  const baseLinks: EventLink[] = [];
  if (provider) {
    baseLinks.push({
      label: provider.label,
      url: provider.url,
      icon: "🔑",
      kind: "primary",
    });
  }

  const affected: string[] = [];

  if (checkIn) {
    const dayId = await findDay(admin, trip.id, checkIn.localDate);
    if (dayId) {
      const notes =
        [
          checkInTime ? `Заезд: ${checkInTime}` : null,
          checkOutTime ? `Выезд: ${checkOutTime}` : null,
          priceLabel ? `Оплачено: ${priceLabel}` : null,
          s.confirmation ? `Код: ${s.confirmation}` : null,
          s.host ? `Хозяин: ${s.host}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null;

      const ok = await upsertEvent(admin, {
        trip_id: trip.id,
        day_id: dayId,
        destination_id: destinationId,
        kind: "stay",
        start_at: checkIn.iso,
        end_at: null,
        title: `Заселение: ${nameLabel}`,
        notes,
        emoji: "🔑",
        address,
        sort_order: -10,
        map_url: mapUrl,
        website: bookingUrl,
        phone: s.host_phone ?? null,
        booking_url: bookingUrl,
        map_embed_url: mapEmbed,
        links: baseLinks,
      });
      if (ok) count++;
      affected.push(dayId);
    }
  }

  if (checkOut) {
    const dayId = await findDay(admin, trip.id, checkOut.localDate);
    if (dayId) {
      const notes =
        [
          checkOutTime ? `Выезд: ${checkOutTime}` : null,
          s.confirmation ? `Код: ${s.confirmation}` : null,
        ]
          .filter(Boolean)
          .join(" · ") || null;
      const ok = await upsertEvent(admin, {
        trip_id: trip.id,
        day_id: dayId,
        destination_id: destinationId,
        kind: "stay",
        start_at: checkOut.iso,
        end_at: null,
        title: `Выезд: ${nameLabel}`,
        notes,
        emoji: "🧳",
        address,
        sort_order: 100,
        map_url: mapUrl,
        website: bookingUrl,
        phone: s.host_phone ?? null,
        booking_url: bookingUrl,
        map_embed_url: null,
        links: baseLinks,
      });
      if (ok) count++;
      affected.push(dayId);
    }
  }

  for (const dayId of new Set(affected))
    await refreshDayDetail(admin, dayId);

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

/**
 * Склеивает локальный `YYYY-MM-DD` и `HH:MM` в trip-TZ и возвращает
 * UTC ISO. Использует уже существующий normalizeDateTime: собираем
 * наивную строку и пропускаем через него.
 */
function combineDateTimeIso(
  date: string,
  hhmm: string | null | undefined,
  tz: string
): string | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const res = normalizeDateTime(`${date}T${hhmm}`, tz);
  return res?.iso ?? null;
}

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

  // Экскурсионный билет (Tripster и т.п.): формируем tour_details из
  // структурированных полей, достаём ticket_url, ставим website.
  const isTourTicket = e.category === "tours" || e.category === "activities";
  const ticketUrl = isTourTicket ? e.tour_url ?? null : null;
  const guideExtras = (e.extras ?? []).filter((x) => x && x.label);
  const tourDetails: TourDetailsRow | null = isTourTicket
    ? {
        guide_name: e.guide_name ?? null,
        guide_phone: e.guide_phone ?? null,
        paid_amount: e.paid_amount ?? null,
        paid_currency: e.paid_currency ?? null,
        due_amount: e.due_amount ?? null,
        due_currency: e.due_currency ?? null,
        extras: guideExtras.map((x) => ({
          label: x.label as string,
          amount: x.amount ?? null,
          currency: x.currency ?? null,
        })),
      }
    : null;
  // Если ни одно поле не заполнено — не сохраняем пустой объект,
  // чтобы карточка не рендерила пустой блок «Гид: —».
  const hasAnyTourField =
    tourDetails &&
    (tourDetails.guide_name ||
      tourDetails.guide_phone ||
      tourDetails.paid_amount != null ||
      tourDetails.due_amount != null ||
      (tourDetails.extras && tourDetails.extras.length > 0));

  // Время начала/окончания экскурсии (HH:MM + occurred_on + trip TZ).
  const startAt = combineDateTimeIso(
    e.occurred_on,
    e.start_time,
    trip.primary_tz
  );
  const endAt = combineDateTimeIso(
    e.occurred_on,
    e.end_time,
    trip.primary_tz
  );

  const notes = e.merchant && e.description ? e.merchant : null;

  const ok = await upsertEvent(admin, {
    trip_id: trip.id,
    day_id: dayId,
    destination_id: null,
    kind: kindInfo.kind,
    start_at: startAt,
    end_at: endAt,
    title,
    notes,
    emoji: kindInfo.emoji,
    address: null,
    sort_order: 10,
    map_url: null,
    website: ticketUrl,
    phone: e.guide_phone ?? null,
    booking_url: null,
    map_embed_url: null,
    links: [],
    ticket_url: ticketUrl,
    tour_details: hasAnyTourField ? tourDetails : null,
  });
  await refreshDayDetail(admin, dayId);
  return ok ? 1 : 0;
}
