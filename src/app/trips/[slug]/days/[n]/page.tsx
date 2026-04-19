import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import Timeline, { type TimelineEvent } from "@/components/Timeline";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeInTz } from "@/lib/format-tz";
import { updateDayMetaAction } from "../actions";

export const dynamic = "force-dynamic";

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

type DayRow = {
  id: string;
  date: string;
  title: string | null;
  detail: string | null;
  badge: string | null;
};

type EventRow = {
  id: string;
  title: string;
  kind: string;
  notes: string | null;
  map_url: string | null;
  start_at: string | null;
  end_at: string | null;
  sort_order: number | null;
};

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
    .select(
      "id,slug,title,country,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: daysData } = await admin
    .from("days")
    .select("id,date,title,detail,badge")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });

  const days = (daysData ?? []) as DayRow[];
  const day = days[dayNumber - 1];
  if (!day) notFound();

  const totalDays = days.length;
  const prevHref =
    dayNumber > 1 ? `/trips/${trip.slug}/days/${dayNumber - 1}` : null;
  const nextHref =
    dayNumber < totalDays ? `/trips/${trip.slug}/days/${dayNumber + 1}` : null;

  const { data: eventsData } = await admin
    .from("events")
    .select("id,title,kind,notes,map_url,start_at,end_at,sort_order")
    .eq("day_id", day.id)
    .order("sort_order", { ascending: true });

  const events: TimelineEvent[] = (
    (eventsData ?? []) as EventRow[]
  ).map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    notes: e.notes,
    map_url: e.map_url,
    start_time: formatTimeInTz(e.start_at, trip.primary_tz),
    end_time: formatTimeInTz(e.end_at, trip.primary_tz),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  const dateLabel = format(parseISO(day.date), "EEEE, d MMMM yyyy", {
    locale: ru,
  });

  return (
    <>
      <OfflineBanner />
      <Header
        title={day.title || `День ${dayNumber}`}
        subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        back={`/trips/${trip.slug}/days`}
        trip={
          !isPast
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel: trip.country
                  ? trip.country.slice(0, 3).toUpperCase()
                  : "TZ",
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-5">
        {/* Day meta form */}
        <form
          action={async (fd: FormData) => {
            "use server";
            await updateDayMetaAction(slug, dayNumber, fd);
          }}
          className="bg-white rounded-card shadow-card p-4 space-y-3"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Заголовок дня
            </label>
            <input
              name="title"
              defaultValue={day.title ?? ""}
              placeholder={`День ${dayNumber}`}
              maxLength={120}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Краткое описание
            </label>
            <input
              name="detail"
              defaultValue={day.detail ?? ""}
              placeholder="Например: перелёт Москва → Тиват, заселение"
              maxLength={400}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Пометка
            </label>
            <input
              name="badge"
              defaultValue={day.badge ?? ""}
              placeholder="Например: Прилёт, Выезд"
              maxLength={24}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              className="bg-text-main text-white rounded-btn px-4 py-[10px] text-[13px] font-medium active:opacity-85"
            >
              Сохранить
            </button>
          </div>
        </form>

        {/* Timeline */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
              Таймлайн
            </h2>
            <Link
              href={`/trips/${trip.slug}/days/${dayNumber}/events/new`}
              className="text-[12px] font-medium text-accent"
            >
              + Событие
            </Link>
          </div>
          <Timeline
            slug={trip.slug}
            dayNumber={dayNumber}
            events={events}
            readOnly={isPast}
          />
        </div>

        {/* Prev / Next navigation */}
        <div className="flex gap-3">
          {prevHref ? (
            <Link
              href={prevHref}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[13px] font-medium text-center text-text-main active:bg-bg-surface"
            >
              ← День {dayNumber - 1}
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[13px] font-medium text-center text-text-main active:bg-bg-surface"
            >
              День {dayNumber + 1} →
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>

      <BottomNav slug={trip.slug} />
    </>
  );
}
