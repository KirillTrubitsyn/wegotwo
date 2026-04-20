import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import Timeline, {
  type TimelineEvent,
  type TimelineLink,
  type TimelineAttachment,
  type TourDetails,
} from "@/components/Timeline";
import DayActionsMenu from "@/components/DayActionsMenu";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import { formatTimeInTz } from "@/lib/format-tz";
import { displayDayDetail } from "@/lib/ingest/day-detail";
import { deleteEventAction, updateDayMetaAction } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Обрезает расширение файла и приводит к короткой подписи, чтобы
 * использовать как label в «🎫 Билет {label}». Например
 * «boarding_pass_kirill.pdf» → «boarding pass kirill».
 * Возвращаем null для пустых/шумных значений.
 */
function cleanDocTitle(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.replace(/\.(pdf|jpe?g|png|heic|webp)$/i, "").trim();
  if (!t) return null;
  // Шумные автогенераты вроде «document 12345» не тащим — лучше null.
  if (/^document[\s_-]*\d+$/i.test(t)) return null;
  return t;
}

type Trip = {
  id: string;
  slug: string;
  title: string;
  country: string | null;
  primary_tz: string;
  color: string;
  date_from: string;
  date_to: string;
  archived_at: string | null;
};

type DayRow = {
  id: string;
  date: string;
  title: string | null;
  detail: string | null;
  badge: string | null;
};

type EventAttachmentRow = {
  document_id: string;
  label: string | null;
};

type EventRow = {
  id: string;
  title: string;
  kind: string;
  notes: string | null;
  map_url: string | null;
  website: string | null;
  menu_url: string | null;
  phone: string | null;
  emoji: string | null;
  address: string | null;
  photo_path: string | null;
  start_at: string | null;
  end_at: string | null;
  sort_order: number | null;
  booking_url: string | null;
  map_embed_url: string | null;
  links: TimelineLink[] | null;
  description: string | null;
  tour_details: TourDetails | null;
  ticket_url: string | null;
  document_id: string | null;
  attachments: EventAttachmentRow[] | null;
};

export default async function DayDetailPage({
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
    .select(
      "id,slug,title,country,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  // Параллелим days и резолв города заголовка — они независимы.
  const [{ data: daysData }, stayCity] = await Promise.all([
    admin
      .from("days")
      .select("id,date,title,detail,badge")
      .eq("trip_id", trip.id)
      .order("date", { ascending: true }),
    resolveHeaderDestination(admin, trip.id, trip.primary_tz),
  ]);

  const days = (daysData ?? []) as DayRow[];
  const day = days[dayNumber - 1];
  if (!day) notFound();

  const totalDays = days.length;
  const prevHref =
    dayNumber > 1 ? `/trips/${trip.slug}/days/${dayNumber - 1}` : null;
  const nextHref =
    dayNumber < totalDays ? `/trips/${trip.slug}/days/${dayNumber + 1}` : null;

  // Пробуем прочитать расширенные поля (phase 14). Если миграция
  // `20260420000002_phase14_event_links.sql` ещё не применена к базе
  // (`booking_url`/`map_embed_url`/`links` отсутствуют), запрос упадёт
  // c 42703 и таймлайн окажется пустым — делаем fallback на базовый
  // набор колонок, чтобы события всё равно отображались.
  // Расширенный select включает обе волны phase14 и phase16. Если
  // ни те, ни другие колонки не применены, делаем два отступа подряд.
  let rawEvents: EventRow[] = [];
  {
    const full = await admin
      .from("events")
      .select(
        "id,title,kind,notes,map_url,website,menu_url,phone,emoji,address,photo_path,start_at,end_at,sort_order,booking_url,map_embed_url,links,description,tour_details,ticket_url,document_id,attachments"
      )
      .eq("day_id", day.id)
      .order("start_at", { ascending: true, nullsFirst: false })
      .order("sort_order", { ascending: true });
    if (!full.error) {
      rawEvents = (full.data ?? []) as EventRow[];
    } else {
      console.warn(
        "[day] full events select failed, trying phase17-only:",
        full.error.message
      );
      const phase17 = await admin
        .from("events")
        .select(
          "id,title,kind,notes,map_url,website,menu_url,phone,emoji,address,photo_path,start_at,end_at,sort_order,booking_url,map_embed_url,links,description,tour_details,ticket_url,document_id"
        )
        .eq("day_id", day.id)
        .order("start_at", { ascending: true, nullsFirst: false })
        .order("sort_order", { ascending: true });
      if (!phase17.error) {
        rawEvents = ((phase17.data ?? []) as Omit<
          EventRow,
          "attachments"
        >[]).map((e) => ({ ...e, attachments: null }));
      } else {
        const phase14 = await admin
          .from("events")
          .select(
            "id,title,kind,notes,map_url,website,menu_url,phone,emoji,address,photo_path,start_at,end_at,sort_order,booking_url,map_embed_url,links"
          )
          .eq("day_id", day.id)
          .order("start_at", { ascending: true, nullsFirst: false })
          .order("sort_order", { ascending: true });
        if (!phase14.error) {
          rawEvents = ((phase14.data ?? []) as Omit<
            EventRow,
            | "description"
            | "tour_details"
            | "ticket_url"
            | "document_id"
            | "attachments"
          >[]).map((e) => ({
            ...e,
            description: null,
            tour_details: null,
            ticket_url: null,
            document_id: null,
            attachments: null,
          }));
        } else {
          const basic = await admin
            .from("events")
            .select(
              "id,title,kind,notes,map_url,website,menu_url,phone,emoji,address,photo_path,start_at,end_at,sort_order"
            )
            .eq("day_id", day.id)
            .order("start_at", { ascending: true, nullsFirst: false })
            .order("sort_order", { ascending: true });
          rawEvents = ((basic.data ?? []) as Omit<
            EventRow,
            | "booking_url"
            | "map_embed_url"
            | "links"
            | "description"
            | "tour_details"
            | "ticket_url"
            | "document_id"
            | "attachments"
          >[]).map((e) => ({
            ...e,
            booking_url: null,
            map_embed_url: null,
            links: null,
            description: null,
            tour_details: null,
            ticket_url: null,
            document_id: null,
            attachments: null,
          }));
        }
      }
    }
  }

  // Batch signed URLs for all photo_path values on this day.
  const photoPaths = rawEvents
    .map((e) => e.photo_path)
    .filter((p): p is string => typeof p === "string" && p.length > 0);
  let photoUrlByPath = new Map<string, string>();
  if (photoPaths.length > 0) {
    const { data: signed } = await admin.storage
      .from("photos")
      .createSignedUrls(photoPaths, 3600);
    photoUrlByPath = new Map(
      (signed ?? [])
        .map((s, i) => [photoPaths[i], s.signedUrl] as const)
        .filter((pair): pair is readonly [string, string] =>
          typeof pair[1] === "string" && pair[1].length > 0
        )
    );
  }

  // Подтягиваем сторадж-пути документов, связанных с событиями, и
  // генерим signed URL на каждый — чтобы в Timeline была кнопка
  // «🎫 Билет», открывающая исходный файл (Tripster PDF, посадочный).
  //
  // Для событий с `attachments` (phase 18: несколько посадочных на
  // один рейс) собираем все document_id из массивов — это и даёт
  // несколько кнопок «Билет Кирилла / Билет Марины».
  const docIdSet = new Set<string>();
  for (const e of rawEvents) {
    if (e.document_id) docIdSet.add(e.document_id);
    for (const a of e.attachments ?? []) {
      if (a?.document_id) docIdSet.add(a.document_id);
    }
  }
  const docIds = Array.from(docIdSet);
  const ticketUrlByDoc = new Map<string, string>();
  const docTitleById = new Map<string, string>();
  if (docIds.length > 0) {
    const { data: docRows } = await admin
      .from("documents")
      .select("id,storage_path,title")
      .in("id", docIds);
    const rows = (docRows ?? []) as Array<{
      id: string;
      storage_path: string;
      title: string | null;
    }>;
    for (const r of rows) {
      if (r.title) docTitleById.set(r.id, r.title);
    }
    const paths = rows.map((d) => d.storage_path);
    if (paths.length > 0) {
      const { data: signed } = await admin.storage
        .from("documents")
        .createSignedUrls(paths, 3600);
      const signedByPath = new Map(
        (signed ?? [])
          .map((s, i) => [paths[i], s.signedUrl] as const)
          .filter((pair): pair is readonly [string, string] =>
            typeof pair[1] === "string" && pair[1].length > 0
          )
      );
      for (const d of rows) {
        const u = signedByPath.get(d.storage_path);
        if (u) ticketUrlByDoc.set(d.id, u);
      }
    }
  }

  /**
   * Строим список TimelineAttachment для одного события.
   * Приоритет:
   *   1) events.attachments (phase 18) — одна запись на документ,
   *      label либо сохранённый, либо documents.title как fallback;
   *   2) legacy events.document_id — оборачиваем в один элемент.
   */
  function buildAttachments(e: EventRow): TimelineAttachment[] {
    const out: TimelineAttachment[] = [];
    const seen = new Set<string>();
    for (const a of e.attachments ?? []) {
      if (!a?.document_id || seen.has(a.document_id)) continue;
      const url = ticketUrlByDoc.get(a.document_id);
      if (!url) continue;
      seen.add(a.document_id);
      out.push({
        url,
        label: a.label ?? cleanDocTitle(docTitleById.get(a.document_id)),
      });
    }
    if (out.length === 0 && e.document_id) {
      const url = ticketUrlByDoc.get(e.document_id);
      if (url) {
        out.push({
          url,
          label: cleanDocTitle(docTitleById.get(e.document_id)),
        });
      }
    }
    return out;
  }

  const events: TimelineEvent[] = rawEvents.map((e) => ({
    id: e.id,
    title: e.title,
    kind: e.kind,
    notes: e.notes,
    map_url: e.map_url,
    website: e.website,
    menu_url: e.menu_url,
    phone: e.phone,
    emoji: e.emoji,
    address: e.address,
    photo_url: e.photo_path ? photoUrlByPath.get(e.photo_path) ?? null : null,
    start_time: formatTimeInTz(e.start_at, trip.primary_tz),
    end_time: formatTimeInTz(e.end_at, trip.primary_tz),
    booking_url: e.booking_url,
    map_embed_url: e.map_embed_url,
    links: Array.isArray(e.links) ? e.links : [],
    description: e.description,
    tour_details: e.tour_details ?? null,
    ticket_url: e.ticket_url,
    document_url: e.document_id
      ? ticketUrlByDoc.get(e.document_id) ?? null
      : null,
    attachments: buildAttachments(e),
  }));

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  const dateLabel = format(parseISO(day.date), "EEEE, d MMMM yyyy", {
    locale: ru,
  });

  return (
    <>
      <OfflineBanner />
      <Header
        title={day.title || `День ${dayNumber}`}
        subtitle={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        back={`/trips/${trip.slug}/days`}
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

      <div className="px-5 pb-28 pt-4 space-y-5">
        {/* Timeline */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
              Таймлайн
            </h2>
            <DayActionsMenu
              slug={trip.slug}
              dayNumber={dayNumber}
              dayTitle={day.title ?? ""}
              dayDetail={displayDayDetail(day.detail) ?? ""}
              dayNumberLabel={`День ${dayNumber}`}
              events={events.map((e) => ({
                id: e.id,
                title: e.title,
                time: e.start_time,
              }))}
              updateDayMeta={async (fd: FormData) => {
                "use server";
                await updateDayMetaAction(slug, dayNumber, fd);
              }}
              deleteEvent={async (eventId: string) => {
                "use server";
                await deleteEventAction(slug, dayNumber, eventId);
              }}
              readOnly={isPast}
            />
          </div>
          <Timeline
            slug={trip.slug}
            dayNumber={dayNumber}
            events={events}
            readOnly={isPast}
          />
        </div>

        {/* Prev / Next navigation */}
        <div className="flex gap-3">
          {prevHref ? (
            <Link
              href={prevHref}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[13px] font-medium text-center text-text-main active:bg-bg-surface"
            >
              ← День {dayNumber - 1}
            </Link>
          ) : (
            <div className="flex-1" />
          )}
          {nextHref ? (
            <Link
              href={nextHref}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[13px] font-medium text-center text-text-main active:bg-bg-surface"
            >
              День {dayNumber + 1} →
            </Link>
          ) : (
            <div className="flex-1" />
          )}
        </div>
      </div>

      <BottomNav slug={trip.slug} />
    </>
  );
}
