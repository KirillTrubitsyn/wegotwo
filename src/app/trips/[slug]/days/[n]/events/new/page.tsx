import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import EventForm from "../EventForm";
import { createEventAction, type EventActionState } from "../../../actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";

export const dynamic = "force-dynamic";

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

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ slug: string; n: string }>;
}) {
  const { slug, n } = await params;
  const dayNumber = Number(n);
  if (!Number.isInteger(dayNumber) || dayNumber < 1) notFound();

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,primary_tz,country,color,date_to,archived_at")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const stayCity = await resolveHeaderDestination(
    admin,
    trip.id,
    trip.primary_tz
  );

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  const bound = async (
    prev: EventActionState,
    formData: FormData
  ): Promise<EventActionState> => {
    "use server";
    return createEventAction(slug, dayNumber, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Новое событие"
        subtitle={`День ${dayNumber}`}
        back={`/trips/${slug}/days/${dayNumber}`}
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
      <div className="px-5 pb-24 pt-4">
        <EventForm
          tripSlug={slug}
          dayNumber={dayNumber}
          action={bound}
          submitLabel="Добавить"
        />
      </div>
    </>
  );
}
