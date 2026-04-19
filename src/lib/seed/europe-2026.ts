/**
 * Seed the europe-2026 trip from the JSON blobs copied in from
 * /tmp/europe-2026/src/data. Idempotent at the trip level: upserts
 * the trip row by slug and wipes the child rows (days, events,
 * destinations, stays, flights, expenses) before inserting fresh
 * snapshots. Document files and photo binaries are not touched
 * because they live in Supabase Storage and the seed does not
 * have direct filesystem access on Vercel.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import itinerary from "@/seed/europe-2026/itinerary.json";
import flights from "@/seed/europe-2026/flights.json";
import stays from "@/seed/europe-2026/stays.json";
import type { SeedReport } from "./types";
import { destinations as euroDestinations } from "@/seed/europe-2026/destinations";
import {
  SEED_PLACES,
  SEED_CITY_COVERS,
  type SeedPlace,
} from "@/seed/europe-2026/places";
import { uploadSeedPhotos } from "./upload-photos";

type SimpleObject = Record<string, unknown>;

const TRIP_SLUG = "europe-2026";
const TRIP_TZ = "Europe/Paris";
const TRIP_BASE_CCY = "EUR";
const TRIP_DATE_FROM = "2026-02-23";
const TRIP_DATE_TO = "2026-03-07";

const MONTH_RU: Record<string, string> = {
  января: "01",
  февраля: "02",
  марта: "03",
  апреля: "04",
  мая: "05",
  июня: "06",
  июля: "07",
  августа: "08",
  сентября: "09",
  октября: "10",
  ноября: "11",
  декабря: "12",
  янв: "01",
  фев: "02",
  мар: "03",
  апр: "04",
  май: "05",
  июн: "06",
  июл: "07",
  авг: "08",
  сен: "09",
  окт: "10",
  ноя: "11",
  дек: "12",
};

/** Parse "23 ФЕВ, ПОНЕДЕЛЬНИК" or "24 ФЕВРАЛЯ, ВТОРНИК" into YYYY-MM-DD. */
function parseDateLabel(label: string): string | null {
  const m = label
    .toLowerCase()
    .match(/(\d{1,2})\s+([а-яё]+)/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const monthKey = m[2].replace(/\.$/, "");
  const month = MONTH_RU[monthKey];
  if (!month) return null;
  return `2026-${month}-${day}`;
}

/** Take the leading HH:MM of a range like "04:10 → 07:35" or "~14:00". */
function parseLeadingTime(time?: string | null): string | null {
  if (!time) return null;
  const m = time.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

/** Convert dateLabel + leading HH:MM + IANA zone to a UTC ISO timestamp. */
function toUtcIso(
  dateISO: string,
  hhmm: string,
  timeZone: string
): string | null {
  try {
    // Interpret dateISO + hhmm as wall-clock time in `timeZone` and
    // compute the offset via Intl to produce a UTC instant.
    const naive = new Date(`${dateISO}T${hhmm}:00Z`);
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = Object.fromEntries(
      fmt.formatToParts(naive).map((p) => [p.type, p.value])
    );
    const local = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
      Number(parts.second)
    );
    const offset = local - naive.getTime();
    return new Date(naive.getTime() - offset).toISOString();
  } catch {
    return null;
  }
}

const EVENT_KIND_MAP: Record<string, string> = {
  flight: "flight",
  sight: "activity",
  train: "transfer",
  hotel: "stay",
  alert: "other",
  meal: "meal",
};

const DESTINATION_COLOR_MAP: Record<string, string> = {
  green: "green",
  blue: "blue",
  gold: "gold",
  accent: "accent",
  red: "accent",
  purple: "purple",
};

export async function seedEurope2026(
  admin: SupabaseClient,
  opts: { username: string }
): Promise<SeedReport> {
  const report: SeedReport = {
    trip: { id: "", slug: TRIP_SLUG, created: false },
    destinations: 0,
    days: 0,
    events: 0,
    flights: 0,
    stays: 0,
    expenses: 0,
  };

  // 1. Upsert the trip row by slug.
  const existing = await admin
    .from("trips")
    .select("id")
    .eq("slug", TRIP_SLUG)
    .maybeSingle();

  const tripPayload = {
    slug: TRIP_SLUG,
    title: "Европа 2026",
    subtitle: "Париж · Берлин · Швейцария",
    country: "Франция, Германия, Швейцария",
    date_from: TRIP_DATE_FROM,
    date_to: TRIP_DATE_TO,
    base_currency: TRIP_BASE_CCY,
    primary_tz: TRIP_TZ,
    color: "blue",
    status: "completed",
    archived_at: new Date().toISOString(),
    route_summary: (itinerary as SimpleObject).route
      ? String(((itinerary as SimpleObject).route as SimpleObject).text ?? "")
      : "Москва → Париж → Берлин → Цюрих → Москва",
    stats:
      ((itinerary as SimpleObject).stats as unknown[] | undefined) ?? [],
    created_by_username: opts.username,
  };

  let tripId: string;
  if (existing.data?.id) {
    tripId = existing.data.id as string;
    const { error } = await admin
      .from("trips")
      .update(tripPayload)
      .eq("id", tripId);
    if (error) throw error;
    report.trip = { id: tripId, slug: TRIP_SLUG, created: false };
  } else {
    const { data: inserted, error } = await admin
      .from("trips")
      .insert(tripPayload)
      .select("id")
      .single();
    if (error) throw error;
    tripId = (inserted as { id: string }).id;
    report.trip = { id: tripId, slug: TRIP_SLUG, created: true };
  }

  // 2. Wipe child tables (documents and photos are left alone so that
  //    real binaries uploaded through the UI survive re-seeding).
  for (const table of [
    "events",
    "expenses",
    "flights",
    "stays",
    "days",
    "destinations",
  ] as const) {
    const { error } = await admin.from(table).delete().eq("trip_id", tripId);
    if (error) throw error;
  }

  // 3. Destinations.
  const destRows = euroDestinations.map((d, idx) => ({
    trip_id: tripId,
    name: d.name,
    country: d.country,
    flag_code: d.flagCode,
    lat: d.lat,
    lon: d.lon,
    timezone: d.timezone,
    date_from: d.dateFrom,
    date_to: d.dateTo,
    type: d.type,
    color: DESTINATION_COLOR_MAP[d.color] ?? "blue",
    sort_order: idx,
  }));
  const { data: destInserted, error: destErr } = await admin
    .from("destinations")
    .insert(destRows)
    .select("id,name");
  if (destErr) throw destErr;
  report.destinations = (destInserted ?? []).length;
  const destByName = new Map<string, string>();
  for (const row of (destInserted ?? []) as Array<{
    id: string;
    name: string;
  }>) {
    destByName.set(row.name, row.id);
  }

  // Helper: look up destination id by the destinations.ts `id` key.
  const destIdBySeedId = new Map<string, string>();
  for (const src of euroDestinations) {
    const row = destByName.get(src.name);
    if (row) destIdBySeedId.set(src.id, row);
  }

  // 4. Days: one row per date in the trip range, enriched with the
  //    itinerary dayCards when the date matches their leading label.
  type DayCard = {
    dateLabel: string;
    title: string;
    badge?: string;
    badgeType?: string;
    detail?: string;
    section?: string;
  };
  const dayCards = ((itinerary as SimpleObject).dayCards as DayCard[]) ?? [];
  const dayCardByDate = new Map<string, DayCard>();
  for (const c of dayCards) {
    const iso = parseDateLabel(c.dateLabel);
    if (iso && !dayCardByDate.has(iso)) dayCardByDate.set(iso, c);
  }

  const SECTION_TO_DEST: Record<string, string> = {
    paris: "paris",
    berlin: "berlin",
    switzerland: "walzenhausen",
    "home-flight": "moscow-return",
  };

  const allDates: string[] = [];
  {
    const cur = new Date(TRIP_DATE_FROM + "T00:00:00Z");
    const end = new Date(TRIP_DATE_TO + "T00:00:00Z");
    while (cur.getTime() <= end.getTime()) {
      allDates.push(cur.toISOString().slice(0, 10));
      cur.setUTCDate(cur.getUTCDate() + 1);
    }
  }
  const dayRows = allDates.map((date, idx) => {
    const card = dayCardByDate.get(date);
    const section = card?.section;
    const seedId = section ? SECTION_TO_DEST[section] : undefined;
    return {
      trip_id: tripId,
      destination_id: seedId ? destIdBySeedId.get(seedId) ?? null : null,
      date,
      date_label: card?.dateLabel ?? null,
      title: card?.title ?? null,
      badge: card?.badge ?? null,
      badge_type: card?.badgeType ?? null,
      detail: card?.detail ?? null,
      sort_order: idx,
    };
  });
  const { data: dayInserted, error: dayErr } = await admin
    .from("days")
    .insert(dayRows)
    .select("id,date");
  if (dayErr) throw dayErr;
  report.days = (dayInserted ?? []).length;
  const dayByDate = new Map<string, string>();
  for (const row of (dayInserted ?? []) as Array<{
    id: string;
    date: string;
  }>) {
    dayByDate.set(row.date, row.id);
  }

  // 5a. Upload seed photos to Storage (cities + places) before
  //     anything that references them. Uploads are idempotent
  //     because we use upsert: true on the same trip-scoped path.
  const allPhotoFiles: Array<{ prefix: "places" | "cities"; file: string }> = [
    ...SEED_CITY_COVERS.map((c) => ({
      prefix: "cities" as const,
      file: c.photoFile,
    })),
    ...SEED_PLACES.map((p) => ({
      prefix: "places" as const,
      file: p.photoFile,
    })),
  ];
  const photoPathByFile = await uploadSeedPhotos(admin, tripId, allPhotoFiles);

  // 5b. Attach city covers to destinations.
  for (const cover of SEED_CITY_COVERS) {
    const destId = destIdBySeedId.get(cover.destinationSeedId);
    const storagePath = photoPathByFile.get(cover.photoFile);
    if (!destId || !storagePath) continue;
    const { error } = await admin
      .from("destinations")
      .update({ photo_path: storagePath })
      .eq("id", destId);
    if (error) throw error;
  }

  // 5c. Events from timelines.paris/berlin/switzerland/home.
  type TimelineEvent = {
    id: string;
    time?: string;
    title: string;
    detail?: string;
    type?: string;
  };
  type TimelineBlock = {
    dateLabel: string;
    events?: TimelineEvent[];
    description?: string;
  };
  const timelineKeys = ["paris", "berlin", "switzerland", "home"] as const;
  const eventRows: SimpleObject[] = [];
  for (const key of timelineKeys) {
    const blocks = (
      ((itinerary as SimpleObject).timelines as SimpleObject)[
        key
      ] as TimelineBlock[] | undefined
    ) ?? [];
    for (const block of blocks) {
      const date = parseDateLabel(block.dateLabel);
      if (!date) continue;
      const dayId = dayByDate.get(date);
      if (!dayId) continue;
      const tz = TRIP_TZ; // Trip timeline times are already authored in Paris-local language.
      const events = block.events ?? [];
      events.forEach((ev, idx) => {
        const hhmm = parseLeadingTime(ev.time ?? null);
        const startAt = hhmm ? toUtcIso(date, hhmm, tz) : null;
        eventRows.push({
          trip_id: tripId,
          day_id: dayId,
          start_at: startAt,
          title: ev.title,
          notes: ev.detail ?? null,
          kind: EVENT_KIND_MAP[ev.type ?? "other"] ?? "other",
          sort_order: idx,
          photo_path: null,
          website: null,
          menu_url: null,
          phone: null,
          emoji: null,
          address: null,
          map_url: null,
        });
      });
    }
  }

  // 5d. Place events (restaurants / sights / services) pulled from
  //     SEED_PLACES. Sort_order is high (50+) so itinerary events
  //     stay at the top of each day.
  for (const place of SEED_PLACES) {
    const dayId = dayByDate.get(place.dayDate);
    if (!dayId) continue;
    const hhmm = parseLeadingTime(place.time);
    const startAt = hhmm ? toUtcIso(place.dayDate, hhmm, TRIP_TZ) : null;
    const photoPath = photoPathByFile.get(place.photoFile) ?? null;
    eventRows.push(buildPlaceEventRow(tripId, dayId, place, startAt, photoPath));
  }

  if (eventRows.length > 0) {
    const { error } = await admin.from("events").insert(eventRows);
    if (error) throw error;
    report.events = eventRows.length;
  }

  // 6. Flights.
  type FlightRow = {
    id: string;
    date: string;
    from: { code: string; city: string; time: string };
    to: { code: string; city: string; time: string };
    flightNumber: string;
    airline: string;
    booking?: string;
    baggage?: string;
    terminal?: string;
    seats?: string;
  };
  const flightList = flights as FlightRow[];
  const flightRows = flightList.map((f) => {
    const depHH = parseLeadingTime(f.from.time);
    const arrHH = parseLeadingTime(f.to.time);
    return {
      trip_id: tripId,
      airline: f.airline,
      code: f.flightNumber,
      from_code: f.from.code,
      from_city: f.from.city,
      to_code: f.to.code,
      to_city: f.to.city,
      dep_at: depHH ? toUtcIso(f.date, depHH, TRIP_TZ) : null,
      arr_at: arrHH ? toUtcIso(f.date, arrHH, TRIP_TZ) : null,
      seat: f.seats ?? null,
      pnr: f.booking ?? null,
      baggage: f.baggage ?? null,
      terminal: f.terminal ?? null,
      raw: f as unknown as SimpleObject,
    };
  });
  if (flightRows.length > 0) {
    const { error } = await admin.from("flights").insert(flightRows);
    if (error) throw error;
    report.flights = flightRows.length;
  }

  // 7. Stays.
  type StayRow = {
    id: string;
    city: string;
    name: string;
    address?: string;
    checkIn?: string;
    checkOut?: string;
    confirmationCode?: string;
    host?: string;
    phone?: string;
    price?: string;
  };
  const CITY_TO_DEST: Record<string, string> = {
    paris: "paris",
    berlin: "berlin",
    switzerland: "walzenhausen",
  };
  const stayList = stays as StayRow[];
  const stayRows = stayList.map((s) => {
    const destId = destIdBySeedId.get(CITY_TO_DEST[s.city] ?? "") ?? null;
    const priceNum = s.price ? extractAmount(s.price) : null;
    const priceCcy = s.price ? extractCurrency(s.price) : null;
    return {
      trip_id: tripId,
      destination_id: destId,
      title: s.name,
      address: s.address ?? null,
      host: s.host ?? null,
      host_phone: s.phone ?? null,
      confirmation: s.confirmationCode ?? null,
      price: priceNum,
      currency: priceCcy,
      raw: s as unknown as SimpleObject,
    };
  });
  if (stayRows.length > 0) {
    const { error } = await admin.from("stays").insert(stayRows);
    if (error) throw error;
    report.stays = stayRows.length;
  }

  // 8. Expenses: the two accommodation bookings + Air Serbia extras.
  const expenseRows: SimpleObject[] = [];
  const parisAirbnb = stayList.find((s) => s.city === "paris");
  const berlinMercure = stayList.find((s) => s.city === "berlin");
  if (parisAirbnb?.price) {
    const amount = extractAmount(parisAirbnb.price);
    const ccy = extractCurrency(parisAirbnb.price);
    if (amount && ccy) {
      expenseRows.push(
        buildExpense({
          tripId,
          dayId: dayByDate.get("2026-02-23") ?? null,
          occurredOn: "2026-02-23",
          category: "accommodation",
          merchant: "Airbnb Paris",
          description: parisAirbnb.name,
          amount,
          currency: ccy,
          username: opts.username,
        })
      );
    }
  }
  if (berlinMercure?.price) {
    const amount = extractAmount(berlinMercure.price);
    const ccy = extractCurrency(berlinMercure.price);
    if (amount && ccy) {
      expenseRows.push(
        buildExpense({
          tripId,
          dayId: dayByDate.get("2026-02-26") ?? null,
          occurredOn: "2026-02-26",
          category: "accommodation",
          merchant: "Mercure Berlin",
          description: berlinMercure.name,
          amount,
          currency: ccy,
          username: opts.username,
        })
      );
    }
  }
  // Air Serbia extras — documented as "Кирилл: €40,50 + €90,00 / Марина: €40,50".
  expenseRows.push(
    buildExpense({
      tripId,
      dayId: dayByDate.get("2026-03-07") ?? null,
      occurredOn: "2026-03-07",
      category: "fees",
      merchant: "Air Serbia",
      description: "Выбор мест (Кирилл + Марина)",
      amount: 81.0,
      currency: "EUR",
      username: opts.username,
    }),
    buildExpense({
      tripId,
      dayId: dayByDate.get("2026-03-07") ?? null,
      occurredOn: "2026-03-07",
      category: "fees",
      merchant: "Air Serbia",
      description: "Доп. багаж Кирилла",
      amount: 90.0,
      currency: "EUR",
      username: opts.username,
    })
  );
  if (expenseRows.length > 0) {
    const { error } = await admin.from("expenses").insert(expenseRows);
    if (error) throw error;
    report.expenses = expenseRows.length;
  }

  return report;
}

function extractAmount(price: string): number | null {
  // "$930,08" → 930.08; "€441,64" → 441.64
  const m = price.match(/([\d\s\u00a0]+[.,]?\d*)/);
  if (!m) return null;
  const num = Number(m[1].replace(/[\s\u00a0]/g, "").replace(",", "."));
  return Number.isFinite(num) ? num : null;
}

function extractCurrency(price: string): string | null {
  if (price.includes("€")) return "EUR";
  if (price.includes("$")) return "USD";
  if (price.includes("₽")) return "RUB";
  if (price.includes("CHF")) return "CHF";
  if (price.includes("£")) return "GBP";
  return null;
}

type BuildExpenseArgs = {
  tripId: string;
  dayId: string | null;
  occurredOn: string;
  category: string;
  merchant: string;
  description: string;
  amount: number;
  currency: string;
  username: string;
};

function buildPlaceEventRow(
  tripId: string,
  dayId: string,
  place: SeedPlace,
  startAt: string | null,
  photoPath: string | null
): SimpleObject {
  return {
    trip_id: tripId,
    day_id: dayId,
    start_at: startAt,
    title: place.title,
    notes: place.notes,
    kind: place.kind,
    sort_order: place.sortOrder,
    photo_path: photoPath,
    website: place.website ?? null,
    menu_url: place.menuUrl ?? null,
    phone: place.phone ?? null,
    emoji: place.emoji,
    address: place.address,
    map_url: place.mapUrl,
  };
}

function buildExpense(a: BuildExpenseArgs): SimpleObject {
  // The seed sidesteps historic FX lookup: we record amount_original
  // verbatim and use 1.0 as a placeholder rate when currency==base,
  // and a sensible static rate otherwise. The budget page recomputes
  // totals from these fields, so the placeholder is visible but not
  // misleading (it's marked as source 'cowork' to flag automation).
  const base = "EUR";
  let amountBase = a.amount;
  let rateUsed = 1.0;
  if (a.currency !== base) {
    const staticRates: Record<string, number> = {
      USD: 0.92,
      CHF: 1.05,
      RUB: 0.0095,
      GBP: 1.16,
    };
    rateUsed = staticRates[a.currency] ?? 1.0;
    amountBase = Number((a.amount * rateUsed).toFixed(2));
  }
  return {
    trip_id: a.tripId,
    day_id: a.dayId,
    occurred_on: a.occurredOn,
    category: a.category,
    merchant: a.merchant,
    description: a.description,
    amount_original: a.amount,
    currency_original: a.currency,
    amount_base: amountBase,
    currency_base: base,
    rate_date: a.occurredOn,
    rate_used: rateUsed,
    source: "cowork",
    paid_by_username: a.username,
    created_by_username: a.username,
    split: "equal",
  };
}
