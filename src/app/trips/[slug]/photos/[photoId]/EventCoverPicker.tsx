"use client";

import { useOptimistic, useTransition } from "react";
import { toggleEventCoverAction } from "../actions";

export type EventCoverOption = {
  id: string;
  title: string;
  kind: string;
  emoji: string | null;
  /** Human-readable day label like «Сб, 2 мая». */
  dayLabel: string | null;
  /** Is this photo currently the event's cover? */
  isCurrent: boolean;
};

/**
 * Список событий поездки на странице фото. Тап по строке
 * переключает — становится ли это фото обложкой данного события.
 * Оптимистичный апдейт мгновенно меняет состояние строки;
 * серверный экшен `toggleEventCoverAction` возвращает финальное
 * состояние, и `router.refresh()` перечитывает страницу.
 */
export default function EventCoverPicker({
  slug,
  photoId,
  events,
}: {
  slug: string;
  photoId: string;
  events: EventCoverOption[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    events,
    (state, { eventId, linked }: { eventId: string; linked: boolean }) =>
      state.map((e) =>
        e.id === eventId
          ? { ...e, isCurrent: linked }
          : linked
          ? { ...e, isCurrent: false } // в один момент только одна «Да» для одного события; но две разные фотки могут быть привязаны к двум разным событиям — не сбрасываем другие
          : e
      )
  );
  const [pending, startTransition] = useTransition();

  if (events.length === 0) {
    return (
      <div className="text-[13px] text-text-sec">
        В поездке ещё нет событий — нечем быть обложкой.
      </div>
    );
  }

  const toggle = (eventId: string, currentlyLinked: boolean) => {
    startTransition(async () => {
      setOptimistic({ eventId, linked: !currentlyLinked });
      await toggleEventCoverAction(slug, photoId, eventId);
    });
  };

  return (
    <div className="space-y-1">
      {optimistic.map((e) => (
        <button
          key={e.id}
          type="button"
          disabled={pending}
          onClick={() => toggle(e.id, e.isCurrent)}
          className={`w-full text-left flex items-center gap-[10px] px-3 py-[9px] rounded-btn border transition ${
            e.isCurrent
              ? "bg-blue-lt border-blue/30 text-blue"
              : "bg-white border-black/[0.08] text-text-main hover:bg-bg-surface"
          } disabled:opacity-60`}
        >
          <span className="text-[16px] leading-none">
            {e.emoji ?? eventKindEmoji(e.kind)}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{e.title}</div>
            {e.dayLabel && (
              <div className="text-[11px] text-text-sec truncate">
                {e.dayLabel}
              </div>
            )}
          </div>
          <span
            className={`text-[11px] font-semibold px-[9px] py-[3px] rounded-badge ${
              e.isCurrent
                ? "bg-blue text-white"
                : "bg-bg-surface text-text-sec"
            }`}
          >
            {e.isCurrent ? "Обложка" : "Сделать"}
          </span>
        </button>
      ))}
    </div>
  );
}

function eventKindEmoji(kind: string): string {
  switch (kind) {
    case "flight":
      return "✈";
    case "stay":
      return "🏠";
    case "meal":
      return "🍽";
    case "visit":
      return "📍";
    case "activity":
      return "🎫";
    case "transfer":
      return "🚂";
    default:
      return "•";
  }
}
