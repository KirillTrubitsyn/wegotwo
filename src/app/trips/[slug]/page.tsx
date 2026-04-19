import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import RouteCard from "@/components/RouteCard";
import DayCard from "@/components/DayCard";
import OfflineBanner from "@/components/OfflineBanner";
import CityTabs, { type CityTab } from "@/components/CityTabs";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import { archiveTripAction, deleteTripAction } from "../actions";

export const dynamic = "force-dynamic";

type Trip = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  country: string | null;
  route_summary: string | null;
  date_from: string;
  date_to: string;
  base_currency: string;
  primary_tz: string;
  color: string;
  archived_at: string | null;
  status: string;
};

function phase(trip: Trip): "future" | "current" | "past" {
  const today = new Date().toISOString().slice(0, 10);
  if (trip.archived_at) return "past";
  if (today < trip.date_from) return "future";
  if (today > trip.date_to) return "past";
  return "current";
}

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select(
      "id,slug,title,subtitle,country,route_summary,date_from,date_to,base_currency,primary_tz,color,archived_at,status"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();
  const trip = data as Trip;
  const p = phase(trip);
  const isActive = p === "current" || p === "future";

  const rangeLabel = `${format(parseISO(trip.date_from), "d MMMM", {
    locale: ru,
  })} — ${format(parseISO(trip.date_to), "d MMMM yyyy", { locale: ru })}`;

  // Preview up to 3 upcoming/current days with event counts.
  const today = new Date().toISOString().slice(0, 10);
  const { data: daysData } = await admin
    .from("days")
    .select("id,date,title,detail,badge")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const allDays = (daysData ?? []) as Array<{
    id: string;
    date: string;
    title: string | null;
    detail: string | null;
    badge: string | null;
  }>;

  const { data: evtRows } = await admin
    .from("events")
    .select("day_id")
    .eq("trip_id", trip.id);
  const evtCounts = new Map<string, number>();
  for (const r of (evtRows ?? []) as Array<{ day_id: string }>) {
    evtCounts.set(r.day_id, (evtCounts.get(r.day_id) ?? 0) + 1);
  }

  // Destinations (stay + home) — used both for the city tabs at the top
  // and for the list of city tiles below. We show tiles only for stays
  // that carry a cover photo.
  const { data: destRows } = await admin
    .from("destinations")
    .select(
      "id,name,country,flag_code,type,date_from,date_to,photo_path,sort_order"
    )
    .eq("trip_id", trip.id)
    .in("type", ["stay", "home"])
    .order("sort_order", { ascending: true });
  const allStayHome = (destRows ?? []) as Array<{
    id: string;
    name: string;
    country: string | null;
    flag_code: string | null;
    type: "stay" | "home" | string | null;
    date_from: string | null;
    date_to: string | null;
    photo_path: string | null;
    sort_order: number | null;
  }>;
  const cityTabs: CityTab[] = allStayHome.map((d) => ({
    id: d.id,
    name: d.name,
    flagCode: d.flag_code,
    type: d.type,
    sortOrder: d.sort_order,
    dateFrom: d.date_from,
  }));
  const destinations = allStayHome.filter(
    (d) => d.type === "stay" && d.photo_path
  );
  const destPhotoPaths = destinations
    .map((d) => d.photo_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  let destPhotoByPath = new Map<string, string>();
  if (destPhotoPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from("photos")
      .createSignedUrls(destPhotoPaths, 3600);
    destPhotoByPath = new Map(
      (signed ?? [])
        .map((s, i) => [destPhotoPaths[i], s.signedUrl] as const)
        .filter((pair): pair is readonly [string, string] =>
          typeof pair[1] === "string" && pair[1].length > 0
        )
    );
  }

  const stayCity = await resolveHeaderDestination(admin, trip.id);

  const previewStart = Math.max(
    0,
    allDays.findIndex((d) => d.date >= today)
  );
  const previewDays = allDays
    .map((d, idx) => ({ ...d, n: idx + 1 }))
    .slice(previewStart === -1 ? 0 : previewStart, previewStart + 3);

  return (
    <>
      <OfflineBanner />
      <Header
        title={trip.title}
        subtitle={!isActive ? trip.subtitle ?? rangeLabel : null}
        back="/"
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

      <div className="px-5 pb-32 pt-4 space-y-4">
        {cityTabs.length > 1 && (
          <CityTabs slug={trip.slug} tabs={cityTabs} activeId={null} />
        )}

        <div className="text-[13px] text-text-sec tnum">{rangeLabel}</div>

        {(destinations.length > 0 || allDays.length > 0) && (
          <div className="bg-bg-surface rounded-card p-[4px] flex">
            <span className="flex-1 text-center py-[9px] text-[13px] font-semibold rounded-[10px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.06)] text-text-main">
              Города
            </span>
            <Link
              href={`/trips/${trip.slug}/days`}
              className="flex-1 text-center py-[9px] text-[13px] font-medium rounded-[10px] text-text-sec hover:text-text-main"
            >
              Маршрут
            </Link>
          </div>
        )}

        {destinations.length > 0 ? (
          <section>
            <div className="space-y-[12px]">
              {destinations.map((d) => {
                const photoUrl = d.photo_path
                  ? destPhotoByPath.get(d.photo_path)
                  : null;
                const range = formatCityRange(d.date_from, d.date_to);
                return (
                  <Link
                    key={d.id}
                    href={`/trips/${trip.slug}/destinations/${d.id}`}
                    className="relative block rounded-card overflow-hidden shadow-card bg-bg-surface aspect-[16/9] active:opacity-90"
                  >
                    {photoUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photoUrl}
                        alt={d.name}
                        className="absolute inset-0 w-full h-full object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-l from-black/60 via-black/20 to-transparent" />
                    <div className="absolute right-4 bottom-3 text-right text-white">
                      <div className="text-[24px] font-bold leading-tight drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]">
                        {d.name}
                      </div>
                      {range && (
                        <div className="text-[12px] opacity-95 mt-[2px] tnum drop-shadow-[0_1px_1px_rgba(0,0,0,0.4)]">
                          {range}
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : trip.route_summary ? (
          <RouteCard
            title={trip.route_summary}
            summary={trip.country ?? undefined}
            color={trip.color}
          />
        ) : (
          <div className="bg-white rounded-card shadow-card p-5">
            <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-2">
              Маршрут
            </div>
            <div className="text-text-sec text-[14px]">
              Заполните маршрут в редакторе поездки.
            </div>
          </div>
        )}

        {allDays.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
                {previewStart === -1 ? "Последние дни" : "Ближайшие дни"}
              </h2>
              <Link
                href={`/trips/${trip.slug}/days`}
                className="text-[12px] font-medium text-accent"
              >
                Все {allDays.length}
              </Link>
            </div>
            <div className="space-y-[10px]">
              {previewDays.map((d) => {
                const count = evtCounts.get(d.id) ?? 0;
                const detail = d.detail
                  ? d.detail
                  : count > 0
                  ? `${count} ${plural(count, [
                      "событие",
                      "события",
                      "событий",
                    ])}`
                  : null;
                const badge = d.badge
                  ? d.badge
                  : d.date === today
                  ? "Сегодня"
                  : null;
                const dateLabel = formatShortDate(d.date);
                return (
                  <DayCard
                    key={d.id}
                    href={`/trips/${trip.slug}/days/${d.n}`}
                    dateLabel={dateLabel}
                    title={d.title || `День ${d.n}`}
                    detail={detail}
                    badge={badge}
                    badgeColor={trip.color}
                  />
                );
              })}
            </div>
          </section>
        )}

        <div className="flex gap-3">
          <Link
            href={`/trips/${trip.slug}/edit`}
            className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-center text-text-main active:bg-bg-surface"
          >
            Редактировать
          </Link>
          <form
            action={async () => {
              "use server";
              await archiveTripAction(trip.slug, !trip.archived_at);
            }}
            className="flex-1"
          >
            <button
              type="submit"
              className="w-full bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
            >
              {trip.archived_at ? "Вернуть" : "В архив"}
            </button>
          </form>
        </div>

        <form
          action={async () => {
            "use server";
            await deleteTripAction(trip.slug);
          }}
        >
          <button
            type="submit"
            className="w-full bg-white border border-accent/20 rounded-btn py-[12px] text-[13px] font-medium text-accent active:bg-red-lt"
          >
            Удалить поездку
          </button>
        </form>
      </div>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function formatShortDate(dateISO: string): string {
  const d = parseISO(dateISO);
  const dow = format(d, "EEE", { locale: ru }).toUpperCase();
  const day = format(d, "d", { locale: ru });
  const month = format(d, "MMM", { locale: ru });
  return `${dow} · ${day} ${month}`;
}

function formatCityRange(
  from: string | null,
  to: string | null
): string | null {
  if (!from || !to) return null;
  const a = parseISO(from);
  const b = parseISO(to);
  const sameMonth =
    a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (sameMonth) {
    return `${format(a, "d", { locale: ru })}–${format(b, "d MMMM", {
      locale: ru,
    })}`;
  }
  return `${format(a, "d MMMM", { locale: ru })} — ${format(b, "d MMMM", {
    locale: ru,
  })}`;
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1];
  return forms[2];
}
