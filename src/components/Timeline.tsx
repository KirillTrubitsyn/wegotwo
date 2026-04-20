import Link from "next/link";
import { reorderEventAction, deleteEventAction } from "@/app/trips/[slug]/days/actions";
import EventDescription from "@/components/EventDescription";

export type TimelineLink = {
  label: string;
  url: string;
  icon?: string | null;
  kind?: string | null;
};

export type TourExtra = {
  label: string;
  amount: number | null;
  currency: string | null;
};

export type TourDetails = {
  guide_name?: string | null;
  guide_phone?: string | null;
  paid_amount?: number | null;
  paid_currency?: string | null;
  due_amount?: number | null;
  due_currency?: string | null;
  extras?: TourExtra[] | null;
};

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
  booking_url: string | null;
  map_embed_url: string | null;
  links: TimelineLink[];
  description: string | null;
  tour_details: TourDetails | null;
  ticket_url: string | null;
  /** Signed URL на исходный документ (PDF/JPEG) — кнопка «🎫 Файл». */
  document_url: string | null;
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
              <div className="text-[12px] text-text-sec mb-1 whitespace-pre-line leading-[1.45]">
                {event.address}
              </div>
            )}
            {/* Map preview: iframe for stays, photo for place/meal events. */}
            {event.map_embed_url ? (
              <a
                href={event.map_url ?? event.map_embed_url}
                target="_blank"
                rel="noopener noreferrer"
                className="block mt-2 mb-2 rounded-card overflow-hidden shadow-card bg-bg-surface relative group"
              >
                <iframe
                  src={event.map_embed_url}
                  className="w-full h-[160px] block border-0 pointer-events-none"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
                <span className="absolute top-2 left-2 inline-flex items-center gap-[5px] px-[10px] py-[5px] rounded-badge text-[11px] font-medium bg-white/95 shadow-card text-blue">
                  <span>🗺</span> Карты ↗
                </span>
              </a>
            ) : event.photo_url ? (
              <div className="mt-2 mb-2 rounded-card overflow-hidden shadow-card bg-bg-surface">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={event.photo_url}
                  alt={event.title}
                  className="w-full h-[180px] object-cover"
                  loading="lazy"
                />
              </div>
            ) : null}
            {event.notes && (
              <div className="text-[13px] text-text-sec leading-[1.5] whitespace-pre-wrap">
                {event.notes}
              </div>
            )}
            {/* Payment summary for tour events: paid / due / extras */}
            {event.tour_details && <TourPayment details={event.tour_details} />}
            {/* Collapsible long-form description (Tripster-style blurb) */}
            <EventDescription text={event.description} />
            <div className="flex gap-2 mt-2 flex-wrap">
              {event.ticket_url && (
                <a
                  href={event.ticket_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-gold-lt border border-gold/30 text-[#8a6200] hover:bg-gold/25"
                >
                  <span>🎟</span> Страница экскурсии
                </a>
              )}
              {event.document_url && (
                <a
                  href={event.document_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-bg-surface border border-black/10 text-text-main hover:bg-white"
                >
                  <span>🎫</span> Билет
                </a>
              )}
              {event.booking_url && (
                <a
                  href={event.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-gold-lt border border-gold/30 text-[#8a6200] hover:bg-gold/25"
                >
                  <span>🔑</span> Бронь ↗
                </a>
              )}
              {event.links?.map((l, idx) => (
                <a
                  key={`${l.url}-${idx}`}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={linkChipClass(l.kind)}
                >
                  <span>{l.icon ?? "🔗"}</span> {l.label}
                </a>
              ))}
              {event.map_url && !event.map_embed_url && (
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
              {event.website &&
                event.website !== event.booking_url &&
                !event.links?.some((l) => l.url === event.website) && (
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

function linkChipClass(kind?: string | null): string {
  switch (kind) {
    case "primary":
      return "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-blue-lt border border-blue/20 text-blue hover:bg-blue/15";
    case "board":
      return "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-bg-surface border border-black/10 text-text-main hover:bg-white";
    case "map":
      return "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-blue-lt border border-blue/20 text-blue hover:bg-blue/15";
    case "phone":
      return "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium bg-green-lt border border-green/30 text-green hover:bg-green/20";
    default:
      return "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-black/10 text-text-sec hover:bg-bg-surface";
  }
}

function formatTimeRange(start: string | null, end: string | null): string {
  if (!start && !end) return "";
  if (start && end) return `${start} — ${end}`;
  return start || end || "";
}

function formatMoney(
  amount: number | null | undefined,
  currency: string | null | undefined
): string | null {
  if (amount == null || !Number.isFinite(amount)) return null;
  const formatted = amount.toLocaleString("ru-RU", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${formatted} ${currency}` : formatted;
}

function TourPayment({ details }: { details: TourDetails }) {
  const paid = formatMoney(details.paid_amount, details.paid_currency);
  const due = formatMoney(details.due_amount, details.due_currency);
  const extras = (details.extras ?? []).filter(
    (e) => e && e.label && (e.amount != null || e.currency)
  );
  const hasAnything =
    paid || due || details.guide_name || details.guide_phone || extras.length > 0;
  if (!hasAnything) return null;
  return (
    <div className="mt-2 rounded-card bg-bg-surface border border-black/[0.06] p-3 space-y-[6px]">
      {(details.guide_name || details.guide_phone) && (
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-text-sec">Гид</span>
          <span className="text-text-main font-medium text-right">
            {details.guide_name ?? "—"}
            {details.guide_phone && (
              <>
                {" · "}
                <a
                  href={`tel:${details.guide_phone.replace(/[^+\d]/g, "")}`}
                  className="text-green"
                >
                  {details.guide_phone}
                </a>
              </>
            )}
          </span>
        </div>
      )}
      {paid && (
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-text-sec">Предоплачено</span>
          <span className="text-green font-mono font-semibold tnum">
            {paid}
          </span>
        </div>
      )}
      {due && (
        <div className="flex items-baseline justify-between gap-2 text-[12px]">
          <span className="text-text-sec">Доплата гиду</span>
          <span className="text-accent font-mono font-semibold tnum">
            {due}
          </span>
        </div>
      )}
      {extras.length > 0 && (
        <div className="pt-[6px] mt-[6px] border-t border-black/[0.06] space-y-[4px]">
          <div className="text-[10px] uppercase tracking-[0.5px] text-text-sec font-semibold">
            Доп. расходы
          </div>
          {extras.map((x, i) => (
            <div
              key={i}
              className="flex items-baseline justify-between gap-2 text-[12px]"
            >
              <span className="text-text-main">{x.label}</span>
              <span className="text-text-sec font-mono tnum">
                {formatMoney(x.amount, x.currency) ?? "—"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
