import Link from "next/link";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import TripCard from "@/components/TripCard";
import { createAdminClient } from "@/lib/supabase/admin";

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

export const dynamic = "force-dynamic";

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

function classify(trips: Trip[]) {
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
  const trips = await loadTrips();
  const { hero, upcoming, past } = classify(trips);
  const empty = !hero && upcoming.length === 0 && past.length === 0;

  return (
    <>
      <OfflineBanner />
      <Header title="Поездки" subtitle="Кирилл и Марина" />

      <div className="px-5 pb-32 pt-2">
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
                  coverUrl={null}
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
                      coverUrl={null}
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
                      coverUrl={null}
                      color={t.color}
                      muted
                    />
                  ))}
                </Grid>
              </Section>
            )}
          </>
        )}
      </div>

      <Link
        href="/trips/new"
        className="fixed bottom-[max(20px,env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[440px] bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:opacity-85"
      >
        Новая поездка
      </Link>
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

function EmptyState() {
  return (
    <div className="rounded-card bg-white shadow-card p-6 text-center mt-4">
      <div className="text-[28px] mb-2" aria-hidden>
        🗺
      </div>
      <p className="text-text-main font-medium text-[16px]">
        Поездок пока нет
      </p>
      <p className="text-text-sec text-[13px] mt-1 leading-relaxed">
        Создайте первую поездку кнопкой ниже или скажите Cowork:
        <br />
        «Добавь поездку из папки Черногория».
      </p>
    </div>
  );
}
