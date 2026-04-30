import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeInTz } from "@/lib/format-tz";
import OfflineBanner from "@/components/OfflineBanner";
import BottomNav from "@/components/BottomNav";

/**
 * Детальный экран дня · D2 «По фазам»
 * — Шапка: Черногория / N из total + табы дней пн/1 вт/2 ...
 * — 4 метрики: Потрачено / КМ / Фото / Погода (мок-значения, кроме погоды).
 * — Секции «Утро / День / Вечер» — события группируются по часу start_at.
 * — Кнопка «+ добавить» ведёт на существующий /events/new.
 */

export const revalidate = 30;

type Trip = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  primary_tz: string;
  color: string;
  date_from: string;
  date_to: string;
  archived_at: string | null;
};

type DayRow = { id: string; date: string; title: string | null };

type EventRow = {
  id: string;
  title: string;
  kind: string;
  notes: string | null;
  start_at: string | null;
  end_at: string | null;
  address: string | null;
  sort_order: number | null;
};

// Accent per event kind — перекликается с прототипом D2.
const KIND_ACCENT: Record<string, string> = {
  flight: "#3478F6",
  transfer: "#8B8578",
  hotel: "#2F7D4B",
  food: "#C27A3E",
  restaurant: "#C27A3E",
  activity: "#1D1D1F",
  plan: "#1D1D1F",
};
const KIND_GLYPH: Record<string, string> = {
  flight: "✈",
  transfer: "→",
  hotel: "■",
  food: "●",
  restaurant: "●",
  activity: "○",
  plan: "○",
};
const KIND_LABEL: Record<string, string> = {
  flight: "перелёт",
  transfer: "трансфер",
  hotel: "отель",
  food: "еда",
  restaurant: "еда",
  activity: "план",
  plan: "план",
};

function hourOf(iso: string | null, tz: string): number | null {
  if (!iso) return null;
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    hour12: false,
  });
  const h = Number(fmt.format(new Date(iso)));
  return Number.isFinite(h) ? h : null;
}
function phaseOf(h: number | null): "morning" | "day" | "evening" {
  if (h === null) return "day";
  if (h < 12) return "morning";
  if (h < 18) return "day";
  return "evening";
}

export default async function DayDetailPage({
  params,
}: {
  params: Promise<{ slug: string; n: string }>;
}) {
  const { slug, n } = await params;
  const dayNumber = Number(n);
  if (!Number.isInteger(dayNumber) || dayNumber < 1) notFound();

  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,country,primary_tz,color,date_from,date_to,archived_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: daysData } = await admin
    .from("days")
    .select("id,date,title")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const days = (daysData ?? []) as DayRow[];
  const day = days[dayNumber - 1];
  if (!day) notFound();
  const totalDays = days.length;

  const { data: eventsData } = await admin
    .from("events")
    .select("id,title,kind,notes,start_at,end_at,address,sort_order")
    .eq("day_id", day.id)
    .order("start_at", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true });
  const events = (eventsData ?? []) as EventRow[];

  const bucketed: Record<"morning" | "day" | "evening", EventRow[]> = {
    morning: [],
    day: [],
    evening: [],
  };
  for (const e of events) {
    bucketed[phaseOf(hourOf(e.start_at, trip.primary_tz))].push(e);
  }

  const weekday = format(parseISO(day.date), "EEE", { locale: ru })
    .replace(/\.?$/, "")
    .toLowerCase();
  const dateShort = format(parseISO(day.date), "d MMMM", { locale: ru });

  return (
    <>
      <OfflineBanner />
      {/* ——— Top bar ——— */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5 px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
        <Link
          href="/"
          className="font-mono text-[11px] tracking-[0.16em] uppercase text-[#1D1D1F]"
        >
          ‹ Обзор
        </Link>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/wegotwo-wordmark.svg" alt="" className="h-[28px]" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/photos/K&M.svg"
          alt=""
          className="h-[30px] w-[30px] rounded-full object-cover"
        />
      </header>

      <main className="px-5 pb-28 text-[#1D1D1F]">
        {/* ——— Trip meta ——— */}
        <section className="pt-4 pb-4 border-b border-black/10">
          <div className="flex items-end justify-between">
            <div>
              <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8B8578]">
                Поездка
              </div>
              <h1 className="font-serif font-light text-[28px] tracking-[-0.03em] leading-none mt-1">
                {trip.title}
              </h1>
            </div>
            <div className="text-right">
              <div className="font-mono text-[10px] tracking-[0.2em] text-[#8B8578]">ДЕНЬ</div>
              <div className="font-serif font-extralight text-[40px] leading-[0.9]">
                {dayNumber}
                <span className="text-[#8B8578] text-[22px]">/{totalDays}</span>
              </div>
            </div>
          </div>
          <DayTabs slug={trip.slug} days={days} active={dayNumber} />
        </section>

        {/* ——— 4 metrics: Потрачено / КМ / Фото / Погода ———
            TODO(real data): заменить значения ниже на агрегаты из БД.
            — ПОТРАЧЕНО: sum(expenses.amount_rub_norm) where date = day.date
            — КМ: из событий transfer/flight (distance_km)
            — ФОТО: count(photos) where taken_at::date = day.date
            — ПОГОДА: useWeather(trip.lat, trip.lon) либо forecast API
        */}
        <section className="pt-4 grid grid-cols-4 gap-3 items-end">
          {[
            { l: "ПОТРАЧЕНО", v: "€94" },
            { l: "КМ", v: "47" },
            { l: "ФОТО", v: "24" },
            { l: "ПОГОДА", v: "+19°", icon: "☀" },
          ].map((s) => (
            <div key={s.l}>
              <div className="font-mono text-[9px] tracking-[0.18em] text-[#8B8578]">
                {s.l}
              </div>
              <div className="font-serif font-light text-[22px] leading-none mt-1 inline-flex items-baseline gap-1">
                {s.v}
                {s.icon && <span className="text-[14px]">{s.icon}</span>}
              </div>
            </div>
          ))}
        </section>

        {/* ——— Phases ——— */}
        {(
          [
            { k: "morning", name: "Утро", range: "06:00 — 12:00" },
            { k: "day", name: "День", range: "12:00 — 18:00" },
            { k: "evening", name: "Вечер", range: "18:00 — 00:00" },
          ] as const
        ).map((p) => (
          <section key={p.k} className="pt-6">
            <div className="flex items-baseline justify-between">
              <h2 className="font-serif font-light text-[30px] tracking-[-0.03em] leading-none">
                {p.name}
              </h2>
              <div className="font-mono text-[10px] tracking-[0.12em] text-[#8B8578]">
                {p.range}
              </div>
            </div>
            <div className="mt-3 border-t border-black/10">
              {bucketed[p.k].length === 0 ? (
                <div className="py-4 font-mono text-[11px] tracking-[0.08em] uppercase text-[#AEAEB2]">
                  — свободно —
                </div>
              ) : (
                bucketed[p.k].map((e, i, arr) => {
                  const time = formatTimeInTz(e.start_at, trip.primary_tz) ?? "—";
                  const accent = KIND_ACCENT[e.kind] ?? "#1D1D1F";
                  const glyph = KIND_GLYPH[e.kind] ?? "·";
                  return (
                    <Link
                      key={e.id}
                      href={`/trips/${trip.slug}/days/${dayNumber}/events/${e.id}`}
                      className={`grid grid-cols-[54px_22px_1fr] gap-3 items-center py-3 ${
                        i < arr.length - 1 ? "border-b border-black/5" : ""
                      }`}
                    >
                      <div className="font-serif font-light text-[18px] leading-none">
                        {time}
                      </div>
                      <span
                        className="inline-flex items-center justify-center w-[22px] h-[22px] rounded-full font-mono text-[11px] font-semibold leading-none"
                        style={{ border: `1px solid ${accent}`, color: accent }}
                      >
                        {glyph}
                      </span>
                      <div className="min-w-0">
                        <div className="font-serif text-[17px] leading-[1.15] truncate">
                          {e.title}
                        </div>
                        {(e.notes || e.address) && (
                          <div className="font-mono text-[10px] text-[#8B8578] tracking-[0.05em] mt-0.5 truncate">
                            {e.notes ?? e.address}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })
              )}
              <Link
                href={`/trips/${trip.slug}/days/${dayNumber}/events/new`}
                className="block w-full py-2.5 mt-1.5 border-t border-dashed border-black/20 font-mono text-[10px] tracking-[0.16em] uppercase text-[#8B8578] text-center"
              >
                + добавить
              </Link>
            </div>
          </section>
        ))}

        {/* ——— prev/next ——— */}
        <div className="flex gap-3 mt-8">
          {dayNumber > 1 ? (
            <Link
              href={`/trips/${trip.slug}/days/${dayNumber - 1}`}
              className="flex-1 py-3 text-center font-mono text-[11px] tracking-[0.14em] uppercase border border-black/10 rounded-[10px] active:bg-black/5"
            >
              ‹ День {dayNumber - 1}
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {dayNumber < totalDays ? (
            <Link
              href={`/trips/${trip.slug}/days/${dayNumber + 1}`}
              className="flex-1 py-3 text-center font-mono text-[11px] tracking-[0.14em] uppercase border border-black/10 rounded-[10px] active:bg-black/5"
            >
              День {dayNumber + 1} ›
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        <div className="text-center mt-4 font-mono text-[9px] tracking-[0.14em] text-[#AEAEB2]">
          {weekday.toUpperCase()} · {dateShort.toUpperCase()}
        </div>
      </main>
      <BottomNav slug={trip.slug} active="days" />
    </>
  );
}

/* ——— Day tabs ——— */
function DayTabs({
  slug,
  days,
  active,
}: {
  slug: string;
  days: DayRow[];
  active: number;
}) {
  return (
    <div className="flex gap-1.5 mt-4 overflow-x-auto no-scrollbar -mx-5 px-5">
      {days.map((d, i) => {
        const n = i + 1;
        const isActive = n === active;
        const wd = format(parseISO(d.date), "EEEEEE", { locale: ru })
          .replace(/\.?$/, "")
          .toLowerCase();
        const dm = format(parseISO(d.date), "d");
        return (
          <Link
            key={d.id}
            href={`/trips/${slug}/days/${n}`}
            className={`shrink-0 min-w-[44px] pt-2 pb-2 text-center ${
              isActive ? "border-t-2 border-[#1D1D1F]" : "border-t-2 border-black/10"
            }`}
          >
            <div
              className={`font-mono text-[10px] tracking-[0.08em] ${
                isActive ? "text-[#1D1D1F] font-bold" : "text-[#8B8578]"
              }`}
            >
              {wd}
            </div>
            <div
              className={`font-serif mt-0.5 ${
                isActive ? "text-[18px] font-normal" : "text-[18px] font-light text-[#8B8578]"
              }`}
            >
              {dm}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
