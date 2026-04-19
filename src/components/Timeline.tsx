import Link from "next/link";
import { reorderEventAction, deleteEventAction } from "@/app/trips/[slug]/days/actions";

export type TimelineEvent = {
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
  photo_url: string | null; // signed URL resolved server-side
  start_time: string | null; // HH:MM in trip TZ
  end_time: string | null; // HH:MM in trip TZ
};

const dotStyles: Record<string, string> = {
  flight: "border-blue bg-white",
  stay: "border-gold bg-white",
  transfer: "border-green bg-white",
  meal: "border-gold bg-white",
  visit: "border-purple bg-white",
  activity: "border-purple bg-white",
  other: "border-black/30 bg-white",
};

const dotIcons: Record<string, string> = {
  flight: "✈",
  stay: "🏠",
  transfer: "🚂",
  meal: "🍽",
  visit: "📍",
  activity: "🎫",
  other: "•",
};

type Props = {
  slug: string;
  dayNumber: number;
  events: TimelineEvent[];
  /** Disable edit/reorder controls (for archived trips). */
  readOnly?: boolean;
};

export default function Timeline({
  slug,
  dayNumber,
  events,
  readOnly,
}: Props) {
  if (events.length === 0) {
    return (
      <div className="rounded-card bg-white shadow-card p-6 text-center">
        <p className="text-text-main font-medium text-[15px]">
          Событий пока нет
        </p>
        <p className="text-text-sec text-[13px] mt-1">
          Добавьте первое событие кнопкой ниже.
        </p>
      </div>
    );
  }

  return (
    <div className="relative pl-7">
      <div className="absolute left-[8px] top-1 bottom-1 w-[1.5px] bg-black/10" />
      {events.map((event, i) => {
        const timeLabel = formatTimeRange(event.start_time, event.end_time);
        const isFirst = i === 0;
        const isLast = i === events.length - 1;

        return (
          <div
            key={event.id}
            className={`relative ${isLast ? "" : "pb-[22px]"}`}
          >
            <div
              className={`absolute -left-6 top-[2px] w-[17px] h-[17px] rounded-full border-2 flex items-center justify-center ${
                dotStyles[event.kind] ?? dotStyles.other
              }`}
            >
              <span className="text-[9px]">
                {event.emoji ?? dotIcons[event.kind] ?? dotIcons.other}
              </span>
            </div>
            {timeLabel && (
              <div className="font-mono text-[13px] text-blue font-medium mb-[2px] tnum">
                {timeLabel}
              </div>
            )}
            <div className="text-[14px] font-semibold mb-[2px] text-text-main">
              {event.title}
            </div>
            {event.address && (
              <div className="text-[12px] text-text-sec mb-1">
                {event.address}
              </div>
            )}
            {event.photo_url && (
              <div className="mt-2 mb-2 rounded-card overflow-hidden shadow-card bg-bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.photo_url}
                  alt={event.title}
                  className="w-full h-[180px] object-cover"
                  loading="lazy"
                />
              </div>
            )}
            {event.notes && (
              <div className="text-[13px] text-text-sec leading-[1.5] whitespace-pre-wrap">
                {event.notes}
              </div>
            )}
            <div className="flex gap-2 mt-2 flex-wrap">
              {event.map_url && (
                <a
                  href={event.map_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-blue-lt border border-blue/20 text-blue hover:bg-blue/15"
                >
                  <span>🗺</span> На карте
                </a>
              )}
              {event.menu_url && (
                <a
                  href={event.menu_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-gold-lt border border-gold/30 text-[#8a6200] hover:bg-gold/25"
                >
                  <span>📋</span> Меню
                </a>
              )}
              {event.website && (
                <a
                  href={event.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-black/10 text-text-sec hover:bg-bg-surface"
                >
                  <span>🔗</span> Сайт
                </a>
              )}
              {event.phone && (
                <a
                  href={`tel:${event.phone.replace(/[^+\d]/g, "")}`}
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-green-lt border border-green/30 text-green hover:bg-green/20"
                >
                  <span>📞</span> Позвонить
                </a>
              )}
              {!readOnly && (
                <>
                  <Link
                    href={`/trips/${slug}/days/${dayNumber}/events/${event.id}`}
                    className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-black/10 text-text-sec hover:bg-bg-surface"
                  >
                    Изменить
                  </Link>
                  {!isFirst && (
                    <form
                      action={async () => {
                        "use server";
                        await reorderEventAction(
                          slug,
                          dayNumber,
                          event.id,
                          "up"
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-[5px] px-[10px] py-[7px] rounded-badge text-[12px] font-medium border border-black/10 text-text-sec hover:bg-bg-surface"
                        aria-label="Вверх"
                      >
                        ↑
                      </button>
                    </form>
                  )}
                  {!isLast && (
                    <form
                      action={async () => {
                        "use server";
                        await reorderEventAction(
                          slug,
                          dayNumber,
                          event.id,
                          "down"
                        );
                      }}
                    >
                      <button
                        type="submit"
                        className="inline-flex items-center gap-[5px] px-[10px] py-[7px] rounded-badge text-[12px] font-medium border border-black/10 text-text-sec hover:bg-bg-surface"
                        aria-label="Вниз"
                      >
                        ↓
                      </button>
                    </form>
                  )}
                  <form
                    action={async () => {
                      "use server";
                      await deleteEventAction(slug, dayNumber, event.id);
                    }}
                  >
                    <button
                      type="submit"
                      className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-accent/20 text-accent hover:bg-red-lt"
                    >
                      Удалить
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && end) return `${start} — ${end}`;
  return start || end || "";
}
