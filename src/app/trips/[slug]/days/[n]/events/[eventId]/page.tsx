import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import EventForm from "../EventForm";
import { updateEventAction, type EventActionState } from "../../../actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatTimeInTz } from "@/lib/format-tz";

export const dynamic = "force-dynamic";

type Trip = {
  id: string;
  slug: string;
  primary_tz: string;
};

type DayRow = {
  id: string;
  date: string;
};

type EventRow = {
  id: string;
  title: string;
  kind: string;
  notes: string | null;
  map_url: string | null;
  start_at: string | null;
  end_at: string | null;
};

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ slug: string; n: string; eventId: string }>;
}) {
  const { slug, n, eventId } = await params;
  const dayNumber = Number(n);
  if (!Number.isInteger(dayNumber) || dayNumber < 1) notFound();

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,primary_tz")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: days } = await admin
    .from("days")
    .select("id,date")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const day = ((days ?? []) as DayRow[])[dayNumber - 1];
  if (!day) notFound();

  const { data: eventData } = await admin
    .from("events")
    .select("id,title,kind,notes,map_url,start_at,end_at")
    .eq("id", eventId)
    .eq("day_id", day.id)
    .maybeSingle();
  if (!eventData) notFound();
  const event = eventData as EventRow;

  const bound = async (
    prev: EventActionState,
    formData: FormData
  ): Promise<EventActionState> => {
    "use server";
    return updateEventAction(slug, dayNumber, eventId, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Изменить событие"
        subtitle={`День ${dayNumber}`}
        back={`/trips/${slug}/days/${dayNumber}`}
      />
      <div className="px-5 pb-24 pt-4">
        <EventForm
          tripSlug={slug}
          dayNumber={dayNumber}
          action={bound}
          submitLabel="Сохранить"
          initial={{
            title: event.title,
            kind: event.kind,
            notes: event.notes,
            map_url: event.map_url,
            start_time: formatTimeInTz(event.start_at, trip.primary_tz),
            end_time: formatTimeInTz(event.end_at, trip.primary_tz),
          }}
        />
      </div>
    </>
  );
}
