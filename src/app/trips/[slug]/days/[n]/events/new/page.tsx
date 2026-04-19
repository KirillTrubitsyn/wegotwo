import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import EventForm from "../EventForm";
import { createEventAction, type EventActionState } from "../../../actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ slug: string; n: string }>;
}) {
  const { slug, n } = await params;
  const dayNumber = Number(n);
  if (!Number.isInteger(dayNumber) || dayNumber < 1) notFound();

  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id,slug,title")
    .eq("slug", slug)
    .maybeSingle();
  if (!trip) notFound();

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
