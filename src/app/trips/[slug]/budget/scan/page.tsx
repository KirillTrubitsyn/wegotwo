import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import ReceiptScanForm from "./ReceiptScanForm";
import { uploadReceiptAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function ScanEntryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,base_currency,country,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as {
    id: string;
    slug: string;
    title: string;
    base_currency: string;
    country: string | null;
    primary_tz: string;
    color: string;
    date_from: string;
    date_to: string;
    archived_at: string | null;
  };

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;
  const stayCity = await resolveHeaderDestination(admin, trip.id);

  const action = uploadReceiptAction.bind(null, slug);

  return (
    <>
      <OfflineBanner />
      <Header
        title="Сканировать чек"
        subtitle={trip.title}
        back={`/trips/${slug}/budget`}
        trip={
          !isPast
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel: stayCity?.label ?? (
                  trip.country
                    ? trip.country.slice(0, 3).toUpperCase()
                    : "TZ"
                ),
                lat: stayCity?.lat ?? null,
                lon: stayCity?.lon ?? null,
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-10 pt-4">
        <ReceiptScanForm action={action} baseCurrency={trip.base_currency} />
      </div>
    </>
  );
}
