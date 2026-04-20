import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import EventForm from "../EventForm";
import EventAttachmentsEditor from "./EventAttachmentsEditor";
import {
  updateEventAction,
  addEventAttachmentAction,
  removeEventAttachmentAction,
  type EventActionState,
} from "../../../actions";
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

type AttachmentRow = {
  document_id: string;
  label: string | null;
};

type EventRow = {
  id: string;
  title: string;
  kind: string;
  notes: string | null;
  map_url: string | null;
  start_at: string | null;
  end_at: string | null;
  document_id: string | null;
  attachments: AttachmentRow[] | null;
};

type DocRow = {
  id: string;
  title: string | null;
  storage_path: string;
  kind: string | null;
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
    .select("id,title,kind,notes,map_url,start_at,end_at,document_id,attachments")
    .eq("id", eventId)
    .eq("day_id", day.id)
    .maybeSingle();
  if (!eventData) notFound();
  const event = eventData as EventRow;

  // Build the canonical attachments list the same way page.tsx does.
  const rawAttachments: AttachmentRow[] = Array.isArray(event.attachments)
    ? event.attachments.filter((a) => a?.document_id)
    : [];
  const seeded: AttachmentRow[] =
    rawAttachments.length === 0 && event.document_id
      ? [{ document_id: event.document_id, label: null }]
      : rawAttachments;

  // Fetch document metadata for all available trip docs.
  const { data: allDocs } = await admin
    .from("documents")
    .select("id,title,storage_path,kind")
    .eq("trip_id", trip.id)
    .order("created_at", { ascending: true });
  const docs = (allDocs ?? []) as DocRow[];

  const attachmentsForEditor = seeded.map((a) => {
    const doc = docs.find((d) => d.id === a.document_id);
    return {
      document_id: a.document_id,
      label: a.label,
      title: doc?.title ?? null,
    };
  });

  const bound = async (
    prev: EventActionState,
    formData: FormData
  ): Promise<EventActionState> => {
    "use server";
    return updateEventAction(slug, dayNumber, eventId, prev, formData);
  };

  const addAttachment = async (
    documentId: string,
    label: string | null
  ): Promise<void> => {
    "use server";
    await addEventAttachmentAction(slug, dayNumber, eventId, documentId, label);
  };

  const removeAttachment = async (documentId: string): Promise<void> => {
    "use server";
    await removeEventAttachmentAction(slug, dayNumber, eventId, documentId);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Изменить событие"
        subtitle={`День ${dayNumber}`}
        back={`/trips/${slug}/days/${dayNumber}`}
      />
      <div className="px-5 pb-24 pt-4 space-y-6">
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
        <EventAttachmentsEditor
          attachments={attachmentsForEditor}
          availableDocs={docs.map((d) => ({
            id: d.id,
            title: d.title,
            kind: d.kind,
          }))}
          addAttachment={addAttachment}
          removeAttachment={removeAttachment}
        />
      </div>
    </>
  );
}
