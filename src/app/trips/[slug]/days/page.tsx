import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import DayCard from "@/components/DayCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";

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

type EventCount = {
  day_id: string;
  count: number;
};

function phase(trip: Trip): "future" | "current" | "past" {
  const today = new Date().toISOString().slice(0, 10);
  if (trip.archived_at) return "past";
  if (today < trip.date_from) return "future";
  if (today > trip.date_to) return "past";
  return "current";
}

function formatDateLabel(dateISO: string): string {
  const d = parseISO(dateISO);
  const dow = format(d, "EEE", { locale: ru }).toUpperCase();
  const day = format(d, "d", { locale: ru });
  const month = format(d, "MMM", { locale: ru });
  return `${dow} · ${day} ${month}`;
}

export default async function TripDaysPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  // Параллелим три независимых запроса после trip:
  // days, events (для счётчиков), header-город.
  const [
    { data: daysData },
    { data: eventsData },
    stayCity,
  ] = await Promise.all([
    admin
      .from("days")
      .select("id,date,title,detail,badge")
      .eq("trip_id", trip.id)
      .order("date", { ascending: true }),
    admin.from("events").select("day_id").eq("trip_id", trip.id),
    resolveHeaderDestination(admin, trip.id),
  ]);

  const days = (daysData ?? []) as DayRow[];

  const counts = new Map<string, number>();
  for (const r of (eventsData ?? []) as Array<{ day_id: string }>) {
    counts.set(r.day_id, (counts.get(r.day_id) ?? 0) + 1);
  }

  const today = new Date().toISOString().slice(0, 10);
  const isActive = phase(trip) !== "past";

  return (
    <>
      <OfflineBanner />
      <Header
        title="Дни"
        subtitle={trip.title}
        back={`/trips/${trip.slug}`}
        trip={
          isActive
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel:
                  stayCity?.label ??
                  (trip.country
                    ? trip.country.slice(0, 3).toUpperCase()
                    : "TZ"),
                lat: stayCity?.lat ?? null,
                lon: stayCity?.lon ?? null,
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-[10px]">
        {days.length === 0 ? (
          <div className="rounded-card bg-white shadow-card p-6 text-center mt-4">
            <p className="text-text-main font-medium text-[15px]">
              Дней пока нет
            </p>
            <p className="text-text-sec text-[13px] mt-1 leading-relaxed">
              Даты поездки заданы, но список дней ещё не сгенерирован.
              Попробуйте обновить поездку в редакторе.
            </p>
            <Link
              href={`/trips/${trip.slug}/edit`}
              className="inline-block mt-3 text-accent text-[13px] font-medium"
            >
              Открыть редактор
            </Link>
          </div>
        ) : (
          days.map((d, i) => {
            const n = i + 1;
            const eventCount = counts.get(d.id) ?? 0;
            const badge = d.badge
              ? d.badge
              : d.date === today
              ? "Сегодня"
              : d.date < today
              ? null
              : null;
            const detailBits: string[] = [];
            if (d.detail) detailBits.push(d.detail);
            else if (eventCount > 0)
              detailBits.push(
                `${eventCount} ${plural(eventCount, [
                  "событие",
                  "события",
                  "событий",
                ])}`
              );
            return (
              <DayCard
                key={d.id}
                href={`/trips/${trip.slug}/days/${n}`}
                dateLabel={formatDateLabel(d.date)}
                title={d.title || `День ${n}`}
                detail={detailBits.join(" · ") || null}
                badge={badge}
                badgeColor={trip.color}
              />
            );
          })
        )}
      </div>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1];
  return forms[2];
}
