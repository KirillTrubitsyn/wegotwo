"use client";

import { useOptimistic, useTransition } from "react";
import Flag from "@/components/Flag";
import { toggleDestinationCoverAction } from "../actions";

export type DestinationCoverOption = {
  id: string;
  name: string;
  flagCode: string | null;
  type: "stay" | "home" | "transit" | null;
  /** Подпись-диапазон «1–7 мая», если есть даты. */
  rangeLabel: string | null;
  /** Это фото сейчас — обложка данного города? */
  isCurrent: boolean;
};

/**
 * Список городов поездки на странице фото. Тап по строке
 * переключает — становится ли это фото обложкой данного города
 * (destinations.photo_path). Оптимистичный апдейт мгновенно меняет
 * состояние строки; серверный экшен `toggleDestinationCoverAction`
 * возвращает финальное состояние. Это зеркало EventCoverPicker.
 */
export default function DestinationCoverPicker({
  slug,
  photoId,
  destinations,
}: {
  slug: string;
  photoId: string;
  destinations: DestinationCoverOption[];
}) {
  const [optimistic, setOptimistic] = useOptimistic(
    destinations,
    (
      state,
      { destinationId, linked }: { destinationId: string; linked: boolean }
    ) =>
      state.map((d) =>
        d.id === destinationId ? { ...d, isCurrent: linked } : d
      )
  );
  const [pending, startTransition] = useTransition();

  if (destinations.length === 0) {
    return (
      <div className="text-[13px] text-text-sec">
        В поездке ещё нет городов — нечего ставить обложкой.
      </div>
    );
  }

  const toggle = (destinationId: string, currentlyLinked: boolean) => {
    startTransition(async () => {
      setOptimistic({ destinationId, linked: !currentlyLinked });
      await toggleDestinationCoverAction(slug, photoId, destinationId);
    });
  };

  return (
    <div className="space-y-1">
      {optimistic.map((d) => (
        <button
          key={d.id}
          type="button"
          disabled={pending}
          onClick={() => toggle(d.id, d.isCurrent)}
          className={`w-full text-left flex items-center gap-[10px] px-3 py-[9px] rounded-btn border transition ${
            d.isCurrent
              ? "bg-blue-lt border-blue/30 text-blue"
              : "bg-white border-black/[0.08] text-text-main hover:bg-bg-surface"
          } disabled:opacity-60`}
        >
          <Flag code={d.flagCode} size="md" />
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{d.name}</div>
            {d.rangeLabel && (
              <div className="text-[11px] text-text-sec truncate tnum">
                {d.rangeLabel}
              </div>
            )}
          </div>
          <span
            className={`text-[11px] font-semibold px-[9px] py-[3px] rounded-badge ${
              d.isCurrent
                ? "bg-blue text-white"
                : "bg-bg-surface text-text-sec"
            }`}
          >
            {d.isCurrent ? "Обложка" : "Сделать"}
          </span>
        </button>
      ))}
    </div>
  );
}
