import Link from "next/link";
import Image from "next/image";
import { differenceInCalendarDays, format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { COMMON_DOCS } from "@/lib/common-docs/catalog";
import OfflineBanner from "@/components/OfflineBanner";

/**
 * Главная · E·L1
 * — Чистый белый фон.
 * — Fraunces для заголовков через var(--font-serif) (подключается в layout.tsx).
 * — JetBrains Mono для меты/uppercase-лейблов через font-mono.
 * — Одна hero-поездка + «Дальше» (tile 2×N) + одна строка «АРХИВ + N ›».
 * — Блок документов оставлен 1-в-1 с предыдущей главной.
 */

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
    if (error) return [];
    return (data ?? []) as Trip[];
  } catch {
    return [];
  }
}

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
  } catch {
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
      <TopBar />
      <main className="px-5 pb-10 text-[#1D1D1F]">
        {empty ? (
          <EmptyState />
        ) : (
          <>
            {hero && <Hero trip={hero} />}

            {upcoming.length > 0 && (
              <Section label={`Дальше · ${upcoming.length}`}>
                <div className="grid grid-cols-2 gap-3">
                  {upcoming.map((t) => (
                    <TripTile key={t.id} trip={t} />
                  ))}
                </div>
              </Section>
            )}

            {past.length > 0 && <ArchiveRow trips={past} />}
          </>
        )}

        <CommonDocsBlock />
      </main>
    </>
  );
}

/* ——— Top bar ——————————————————————————————————————— */

function TopBar() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-xl border-b border-black/5 px-5 pt-[max(14px,env(safe-area-inset-top))] pb-3 flex items-center justify-between">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/wegotwo-wordmark.svg"
        alt="WeGoTwo"
        className="h-[32px] w-auto block select-none"
        draggable={false}
      />
      <div className="flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/photos/K&M.svg"
          alt="Кирилл и Марина"
          className="h-9 w-9 rounded-full object-cover bg-white shadow-avatar"
        />
      </div>
    </header>
  );
}

/* ——— Hero (ближайшая) ———————————————————————————————— */

function Hero({ trip }: { trip: TripWithCover }) {
  const from = parseISO(trip.date_from);
  const to = parseISO(trip.date_to);
  const days = differenceInCalendarDays(to, from) + 1;
  const countdown = differenceInCalendarDays(from, new Date());
  const metaTop =
    countdown > 0
      ? `Next trip · через ${countdown} ${plural(countdown, ["день", "дня", "дней"])}`
      : countdown === 0
      ? "Next trip · сегодня"
      : "Сейчас";

  return (
    <Link href={`/trips/${trip.slug}`} className="block pt-5 pb-6">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8B8578]">
        {metaTop}
      </div>
      <div className="flex items-end justify-between mt-1">
        <div className="min-w-0">
          <h1
            className="font-serif font-light text-[40px] leading-none tracking-[-0.04em] truncate"
          >
            {trip.title}
          </h1>
          <p className="text-[13px] text-[#8B8578] mt-1 tnum">
            {trip.country ? `${trip.country} · ` : ""}
            {format(from, "d MMM", { locale: ru })} — {format(to, "d MMM yyyy", { locale: ru })}
          </p>
        </div>
        <div className="text-right shrink-0 pl-4">
          <div className="font-serif font-extralight text-[72px] leading-[0.8]">{days}</div>
          <div className="font-mono text-[9px] tracking-[0.2em] text-[#8B8578]">ДНЕЙ</div>
        </div>
      </div>

      <div className="relative mt-4 rounded-[10px] overflow-hidden bg-[#F5F5F7] aspect-[16/8]">
        {trip.coverUrl ? (
          <Image
            src={trip.coverUrl}
            alt=""
            fill
            sizes="(max-width: 480px) 100vw, 440px"
            className="object-cover"
            priority
            unoptimized
          />
        ) : null}
        <div className="absolute right-0 bottom-0 px-3 py-1.5 bg-[#1D1D1F] text-white rounded-tl-[10px] font-mono text-[9px] tracking-[0.2em]">
          ОТКРЫТЬ ДНИ ›
        </div>
      </div>
    </Link>
  );
}

/* ——— Section label ——————————————————————————————————— */

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <section className="pt-4 pb-2">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8B8578] mb-3">
        {label}
      </div>
      {children}
    </section>
  );
}

/* ——— Tile ————————————————————————————————————————— */

function TripTile({ trip }: { trip: TripWithCover }) {
  const from = parseISO(trip.date_from);
  const to = parseISO(trip.date_to);
  const days = differenceInCalendarDays(to, from) + 1;
  const countdown = differenceInCalendarDays(from, new Date());
  return (
    <Link
      href={`/trips/${trip.slug}`}
      className="block rounded-[12px] border border-black/10 bg-[#FAFAF8] p-3"
    >
      <div
        className="h-16 rounded-md mb-2 bg-gradient-to-b from-[#BADCE3] to-[#2C5A67] bg-cover bg-center"
        style={
          trip.coverUrl
            ? { backgroundImage: `url(${trip.coverUrl})` }
            : undefined
        }
      />
      <div className="flex items-baseline justify-between">
        <div className="font-serif text-[18px] leading-none truncate pr-2">{trip.title}</div>
        {countdown > 0 && (
          <div className="font-serif font-light text-[22px] leading-none text-[#2F7D4B]">
            {countdown}
          </div>
        )}
      </div>
      <div className="font-mono text-[9px] text-[#8B8578] tracking-[0.08em] mt-1 tnum">
        {format(from, "d MMM", { locale: ru })} — {format(to, "d MMM", { locale: ru })} · {days} дн
      </div>
    </Link>
  );
}

/* ——— Archive row ————————————————————————————————————— */

function ArchiveRow({ trips }: { trips: TripWithCover[] }) {
  const first = trips[0];
  const rest = trips.length - 1;
  if (!first) return null;
  const from = parseISO(first.date_from);
  const to = parseISO(first.date_to);
  const days = differenceInCalendarDays(to, from) + 1;
  return (
    <div className="mt-4 pt-3 border-t border-dashed border-black/15">
      <Link
        href="/archive"
        className="grid grid-cols-[56px_1fr_auto_auto] gap-3 items-center"
      >
        <div className="font-mono text-[10px] text-[#8B8578] tracking-[0.12em]">АРХИВ</div>
        <div className="font-serif text-[15px] truncate">
          {first.title}{" "}
          <span className="text-[#8B8578] font-mono text-[10px] tracking-[0.08em]">
            · {format(from, "d MMM", { locale: ru })} — {format(to, "d MMM", { locale: ru })} · {days} дн
          </span>
        </div>
        {rest > 0 && (
          <div className="font-mono text-[10px] text-[#8B8578]">+{rest}</div>
        )}
        <div className="text-[#8B8578]">›</div>
      </Link>
    </div>
  );
}

/* ——— Docs (без изменений по смыслу) ————————————————————— */

function CommonDocsBlock() {
  return (
    <section className="mt-6 pt-6 border-t border-black/10">
      <div className="font-mono text-[10px] tracking-[0.2em] uppercase text-[#8B8578] mb-3">
        Документы
      </div>
      <div className="flex items-stretch gap-3">
        <Link
          href="/passports"
          className="flex-1 min-w-0 block bg-[#F5F5F7] rounded-[10px] p-4 active:bg-black/5 border border-black/5"
        >
          <div className="flex items-center gap-3">
            <div className="w-[3px] h-[22px] rounded-sm bg-[#3478F6] flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] font-semibold">
                Загранпаспорта
              </div>
              <div className="font-mono text-[9px] text-[#8B8578] tracking-[0.12em] mt-0.5">
                К. ТРУБИЦЫН · М. БРЕЗЕКЕ · {COMMON_DOCS.length}
              </div>
            </div>
            <div className="text-[#8B8578]">›</div>
          </div>
        </Link>
        <Link
          href="/trips/new"
          aria-label="Новая поездка"
          className="flex-shrink-0 w-[56px] flex items-center justify-center rounded-[10px] border border-dashed border-black/20 text-[#1D1D1F] active:bg-black/5 font-serif text-[24px] font-light"
        >
          +
        </Link>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="text-center mt-10 pb-10">
      <div className="font-serif font-light text-[40px] leading-none tracking-[-0.04em]">
        Новая поездка
      </div>
      <div className="font-mono text-[10px] text-[#8B8578] tracking-[0.2em] mt-3">
        ПОКА НИЧЕГО НЕ ЗАПЛАНИРОВАНО
      </div>
      <Link
        href="/trips/new"
        className="inline-block mt-6 px-6 py-3 rounded-[10px] bg-[#1D1D1F] text-white font-mono text-[11px] tracking-[0.2em]"
      >
        + СОЗДАТЬ
      </Link>
    </div>
  );
}

function plural(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}
