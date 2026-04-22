import Link from "next/link";
import Image from "next/image";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import TripCard from "@/components/TripCard";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMON_DOCS } from "@/lib/common-docs/catalog";

type Trip = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  country: string | null;
  date_from: string;
  date_to: string;
  cover_photo_path: string | null;
  color: string;
  archived_at: string | null;
};

type TripWithCover = Trip & { coverUrl: string | null };

// ISR: главная кешируется 30 с. Все экшены (createTrip, updateTrip,
// archiveTrip, deleteTrip) зовут revalidatePath("/"), поэтому список
// поездок обновляется сразу после любого изменения.
export const revalidate = 30;

async function loadTrips(): Promise<Trip[]> {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("trips")
      .select(
        "id,slug,title,subtitle,country,date_from,date_to,cover_photo_path,color,archived_at"
      )
      .order("date_from", { ascending: true });
    if (error) {
      console.error("[home] supabase error:", error.message);
      return [];
    }
    return (data ?? []) as Trip[];
  } catch (e) {
    console.error("[home] load trips failed:", e);
    return [];
  }
}

/**
 * Resolves a cover URL for each trip. Priority:
 *   1. trips.cover_photo_path (explicitly set).
 *   2. First destination of type='stay' with a photo_path (sort_order asc).
 *
 * All storage paths are signed in a single batched call. Missing covers
 * fall back to the color gradient inside TripCard.
 *
 * TTL must outlive ISR staleness: the page is cached with revalidate=30,
 * but stale-while-revalidate means returning users can receive HTML
 * generated hours ago. 7 days keeps signed URLs valid well past any
 * realistic cache age, so covers never render as broken images.
 */
const COVER_URL_TTL_SECONDS = 60 * 60 * 24 * 7;

async function resolveCovers(trips: Trip[]): Promise<TripWithCover[]> {
  if (trips.length === 0) return [];
  try {
    const admin = createAdminClient();
    const tripIds = trips.map((t) => t.id);
    const { data: destRows } = await admin
      .from("destinations")
      .select("trip_id,photo_path,sort_order")
      .in("trip_id", tripIds)
      .eq("type", "stay")
      .not("photo_path", "is", null)
      .order("sort_order", { ascending: true });

    const destByTrip = new Map<string, string>();
    for (const r of (destRows ?? []) as Array<{
      trip_id: string;
      photo_path: string | null;
    }>) {
      if (!destByTrip.has(r.trip_id) && r.photo_path) {
        destByTrip.set(r.trip_id, r.photo_path);
      }
    }

    const paths: string[] = [];
    const pathByTrip = new Map<string, string>();
    for (const t of trips) {
      const p = t.cover_photo_path ?? destByTrip.get(t.id) ?? null;
      if (p) {
        pathByTrip.set(t.id, p);
        if (!paths.includes(p)) paths.push(p);
      }
    }

    const urlByPath = new Map<string, string>();
    if (paths.length > 0) {
      const { data: signed } = await admin.storage
        .from("photos")
        .createSignedUrls(paths, COVER_URL_TTL_SECONDS);
      for (let i = 0; i < paths.length; i++) {
        const url = signed?.[i]?.signedUrl;
        if (url) urlByPath.set(paths[i], url);
      }
    }

    return trips.map((t) => {
      const path = pathByTrip.get(t.id);
      return {
        ...t,
        coverUrl: path ? urlByPath.get(path) ?? null : null,
      };
    });
  } catch (e) {
    console.error("[home] resolve covers failed:", e);
    return trips.map((t) => ({ ...t, coverUrl: null }));
  }
}

function classify(trips: TripWithCover[]) {
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trips
    .filter((t) => !t.archived_at && t.date_to >= today)
    .sort((a, b) => a.date_from.localeCompare(b.date_from));
  const past = trips
    .filter((t) => t.archived_at || t.date_to < today)
    .sort((a, b) => b.date_from.localeCompare(a.date_from));
  const hero = upcoming.shift() ?? null;
  return { hero, upcoming, past };
}

export default async function HomePage() {
  const tripsRaw = await loadTrips();
  const trips = await resolveCovers(tripsRaw);
  const { hero, upcoming, past } = classify(trips);
  const empty = !hero && upcoming.length === 0 && past.length === 0;

  return (
    <>
      <OfflineBanner />
      <Header
        title="WeGoTwo"
        logoSrc="/wegotwo-wordmark.svg"
        mskClock
        actions={
          <Link
            href="/trips/new"
            aria-label="Новая поездка"
            className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-full bg-blue text-white text-[18px] leading-none font-semibold active:opacity-85"
          >
            +
          </Link>
        }
      />

      <div className="px-5 pb-8 pt-4">
        {empty ? (
          <EmptyState />
        ) : (
          <>
            {hero && (
              <div className="mb-6">
                <TripCard
                  variant="hero"
                  slug={hero.slug}
                  title={hero.title}
                  country={hero.country}
                  dateFrom={hero.date_from}
                  dateTo={hero.date_to}
                  coverUrl={hero.coverUrl}
                  color={hero.color}
                />
              </div>
            )}

            {upcoming.length > 0 && (
              <Section title="Дальше">
                <Grid>
                  {upcoming.map((t) => (
                    <TripCard
                      key={t.id}
                      slug={t.slug}
                      title={t.title}
                      country={t.country}
                      dateFrom={t.date_from}
                      dateTo={t.date_to}
                      coverUrl={t.coverUrl}
                      color={t.color}
                    />
                  ))}
                </Grid>
              </Section>
            )}

            {past.length > 0 && (
              <Section title="Архив">
                <Grid>
                  {past.map((t) => (
                    <TripCard
                      key={t.id}
                      slug={t.slug}
                      title={t.title}
                      country={t.country}
                      dateFrom={t.date_from}
                      dateTo={t.date_to}
                      coverUrl={t.coverUrl}
                      color={t.color}
                      muted
                    />
                  ))}
                </Grid>
              </Section>
            )}

            <CommonDocsBlock />
          </>
        )}
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-3">{children}</div>;
}

function CommonDocsBlock() {
  return (
    <section className="mb-6">
      <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-3">
        Документы для поездок
      </h2>
      <Link
        href="/passports"
        className="block bg-white rounded-card shadow-card p-4 active:bg-bg-surface"
      >
        <div className="flex items-center gap-3">
          <div className="w-[44px] h-[44px] rounded-[12px] bg-blue-lt flex items-center justify-center flex-shrink-0">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden
            >
              <rect
                x="4"
                y="3"
                width="16"
                height="18"
                rx="2"
                stroke="#3478F6"
                strokeWidth="1.8"
              />
              <circle cx="12" cy="11" r="2.5" stroke="#3478F6" strokeWidth="1.6" />
              <path
                d="M8 17c.8-1.6 2.3-2.5 4-2.5s3.2.9 4 2.5"
                stroke="#3478F6"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-text-main">
              Загранпаспорта
            </div>
            <div className="text-[12px] text-text-sec mt-[2px] truncate">
              Кирилл и Марина · {COMMON_DOCS.length} {pluralDocs(COMMON_DOCS.length)}
            </div>
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
            className="text-text-mut"
          >
            <path
              d="M9 6l6 6-6 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </Link>
    </section>
  );
}

function pluralDocs(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "документ";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "документа";
  return "документов";
}

function EmptyState() {
  return (
    <div className="rounded-card bg-white shadow-card p-6 text-center mt-4">
      <div className="inline-flex items-center justify-center w-[72px] h-[72px] rounded-[18px] bg-bg-surface mb-3">
        <Image src="/logo.png" alt="WeGoTwo" width={56} height={56} priority />
      </div>
      <p className="text-text-main font-medium text-[16px]">
        Поездок пока нет
      </p>
      <p className="text-text-sec text-[13px] mt-1 leading-relaxed">
        Создайте первую поездку кнопкой + в шапке или скажите Cowork:
        <br />
        «Добавь поездку из папки Черногория».
      </p>
    </div>
  );
}
