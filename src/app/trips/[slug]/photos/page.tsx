import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";

export const revalidate = 30;

const PHOTOS_BUCKET = "photos";
// TTL подписанных миниатюр должен переживать stale-while-revalidate
// у ISR (revalidate=30 → реальный HTML может быть часами). 7 дней
// — безопасный запас, иначе галерея ловит 403 на «протухшие» ссылки.
const THUMB_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

type Trip = {
  id: string;
  slug: string;
  title: string;
  primary_tz: string;
  country: string | null;
  color: string;
  date_to: string;
  archived_at: string | null;
  cover_photo_path: string | null;
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
      "id,slug,title,primary_tz,country,color,date_to,archived_at,cover_photo_path"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  // Параллелим days, photos и резолв города заголовка.
  const [{ data: dayData }, { data: photoData }, stayCity] = await Promise.all([
    admin
      .from("days")
      .select("id,date")
      .eq("trip_id", trip.id)
      .order("date", { ascending: true }),
    admin
      .from("photos")
      .select("id,storage_path,thumbnail_path,taken_at,day_id,width,height")
      .eq("trip_id", trip.id)
      .order("taken_at", { ascending: true, nullsFirst: false }),
    resolveHeaderDestination(admin, trip.id, trip.primary_tz),
  ]);
  const days = (dayData ?? []) as DayRow[];
  const dayById = new Map(days.map((d) => [d.id, d]));
  const photos = (photoData ?? []) as PhotoRow[];

  // Batch sign URLs for thumbnails.
  const thumbPaths = photos
    .map((p) => p.thumbnail_path ?? p.storage_path)
    .filter((p): p is string => !!p);
  const urlMap = new Map<string, string>();
  if (thumbPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from(PHOTOS_BUCKET)
      .createSignedUrls(thumbPaths, THUMB_URL_TTL_SECONDS);
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
                  coverPath={trip.cover_photo_path}
                />
              );
            })}
            {noDate.length > 0 && (
              <PhotoGroup
                title="Без даты"
                photos={noDate}
                tripSlug={trip.slug}
                urlMap={urlMap}
                coverPath={trip.cover_photo_path}
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
  coverPath,
}: {
  title: string;
  photos: PhotoRow[];
  tripSlug: string;
  urlMap: Map<string, string>;
  coverPath: string | null;
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
          const isCover = coverPath != null && p.storage_path === coverPath;
          return (
            <Link
              key={p.id}
              href={`/trips/${tripSlug}/photos/${p.id}`}
              className="relative aspect-square bg-bg-surface rounded-[10px] overflow-hidden active:opacity-80"
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
              {isCover && (
                <span
                  className="absolute top-1.5 left-1.5 bg-black/55 backdrop-blur-sm text-white text-[10px] font-semibold uppercase tracking-[0.5px] rounded-full px-2 py-[3px] flex items-center gap-1"
                  aria-label="Обложка поездки"
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 2l2.9 6.9L22 10l-5.5 4.8L18 22l-6-3.6L6 22l1.5-7.2L2 10l7.1-1.1L12 2z" />
                  </svg>
                  Обложка
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
