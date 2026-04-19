import Header from "@/components/Header";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function TripOverviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: trip } = await supabase
    .from("trips")
    .select("id,slug,title,country,date_from,date_to,subtitle,route_summary")
    .eq("slug", slug)
    .maybeSingle();

  if (!trip) notFound();

  return (
    <>
      <Header title={trip.title} subtitle={trip.subtitle ?? trip.country ?? undefined} />
      <div className="px-5 pb-32 space-y-4">
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-2">
            Маршрут
          </div>
          <div className="text-text-main text-[15px] leading-relaxed whitespace-pre-line">
            {trip.route_summary ?? "Будет заполнено на Этапе 2."}
          </div>
        </div>
        <div className="bg-white rounded-card shadow-card p-5 text-text-sec text-[13px] leading-relaxed">
          Разделы Обзор, Дни, Документы, Фото, Бюджет подключаются на следующих этапах.
        </div>
        <Link href="/" className="block text-center text-blue text-[14px] font-medium">
          Все поездки
        </Link>
      </div>
    </>
  );
}
