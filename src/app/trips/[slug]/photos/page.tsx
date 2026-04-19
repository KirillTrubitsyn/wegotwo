import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "photos";

type Trip = {
  id: string;
  slug: string;
  title: string;
  primary_tz: string;
  country: string | null;
  color: string;
  date_to: string;
  archived_at: string | null;
};

type DayRow = { id: string; date: string };

type PhotoRow = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  day_id: string | null;
  width: number | null;
  height: number | null;
};

export default async function PhotosPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,primary_tz,country,color,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: dayData } = await admin
    .from("days")
    .select("id,date")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const days = (dayData ?? []) as DayRow[];
  const dayById = new Map(days.map((d) => [d.id, d]));

  const { data: photoData } = await admin
    .from("photos")
    .select(
      "id,storage_path,thumbnail_path,taken_at,day_id,width,height"
    )
    .eq("trip_id", trip.id)
    .order("taken_at", { ascending: true, nullsFirst: false });
  const photos = (photoData ?? []) as PhotoRow[];

  // Batch sign URLs for thumbnails.
  const thumbPaths = photos
    .map((p) => p.thumbnail_path ?? p.storage_path)
    .filter((p): p is string => !!p);
  const urlMap = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls(thumbPaths, 60 * 60);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urlMap.set(s.path, s.signedUrl);
    }
  }

  // Group: each day id → photos, plus "no date" bucket.
  const byDay = new Map<string, PhotoRow[]>();
  const noDate: PhotoRow[] = [];
  for (const p of photos) {
    if (p.day_id && dayById.has(p.day_id)) {
      const arr = byDay.get(p.day_id) ?? [];
      arr.push(p);
      byDay.set(p.day_id, arr);
    } else {
      noDate.push(p);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;
  const stayCity = await resolveHeaderDestination(admin, trip.id);

  return (
    <>
      <OfflineBanner />
      <Header
        title="Фотографии"
        subtitle={trip.title}
        back={`/trips/${trip.slug}`}
        trip={
          !isPast
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

      <div className="px-5 pb-28 pt-4 space-y-5">
        {photos.length === 0 ? (
          <div className="rounded-card bg-white shadow-card p-6 text-center">
            <p className="text-text-main font-medium text-[15px]">
              Фотографий пока нет
            </p>
            <p className="text-text-sec text-[13px] mt-1">
              Загрузите первое фото кнопкой ниже. Дата снимка определит день поездки автоматически.
            </p>
          </div>
        ) : (
          <>
            {days.map((d) => {
              const rows = byDay.get(d.id);
              if (!rows || rows.length === 0) return null;
              return (
                <PhotoGroup
                  key={d.id}
                  title={format(parseISO(d.date), "EEE, d MMMM", {
                    locale: ru,
                  })}
                  photos={rows}
                  tripSlug={trip.slug}
                  urlMap={urlMap}
                />
              );
            })}
            {noDate.length > 0 && (
              <PhotoGroup
                title="Без даты"
                photos={noDate}
                tripSlug={trip.slug}
                urlMap={urlMap}
              />
            )}
          </>
        )}
      </div>

      <Link
        href={`/trips/${trip.slug}/photos/new`}
        className="fixed bottom-[max(72px,calc(env(safe-area-inset-bottom)+72px))] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[440px] bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:opacity-85"
      >
        + Фото
      </Link>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function PhotoGroup({
  title,
  photos,
  tripSlug,
  urlMap,
}: {
  title: string;
  photos: PhotoRow[];
  tripSlug: string;
  urlMap: Map<string, string>;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
          {title}
        </h2>
        <span className="text-[12px] text-text-sec">{photos.length}</span>
      </div>
      <div className="grid grid-cols-3 gap-[6px]">
        {photos.map((p) => {
          const path = p.thumbnail_path ?? p.storage_path;
          const url = path ? urlMap.get(path) : null;
          return (
            <Link
              key={p.id}
              href={`/trips/${tripSlug}/photos/${p.id}`}
              className="aspect-square bg-bg-surface rounded-[10px] overflow-hidden active:opacity-80"
            >
              {url ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover block"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full" />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
