import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import RouteCard from "@/components/RouteCard";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
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
                clockLabel: trip.country
                  ? trip.country.slice(0, 3).toUpperCase()
                  : "TZ",
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-32 pt-4 space-y-4">
        <div className="text-[13px] text-text-sec tnum">{rangeLabel}</div>

        {trip.route_summary ? (
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

        <div className="bg-white rounded-card shadow-card p-5 text-text-sec text-[13px] leading-relaxed">
          Разделы Дни, Документы, Фото и Бюджет подключаются на следующих
          этапах. Используйте нижнюю навигацию после наполнения поездки.
        </div>

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
