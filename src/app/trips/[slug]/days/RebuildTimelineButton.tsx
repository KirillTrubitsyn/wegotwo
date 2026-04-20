"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildTimelineAction } from "./actions";

/**
 * Баннер «Синхронизировать из документов» на странице Дней.
 * Запускает серверный экшен, который:
 *   1) схлопывает дубликаты stays (совпадение по confirmation или
 *      по дате заезда + адресу);
 *   2) переcоздаёт события с превью карты, ссылкой на бронь,
 *      кнопками табло для перелётов;
 *   3) создаёт accommodation-расходы из stays.price (если их нет);
 *   4) обновляет автогенерированное «Краткое описание дня».
 *
 * Клиентский компонент ради `useTransition` — показываем «Обновляем…»
 * пока идёт запрос, затем `router.refresh()` перечитывает серверные
 * компоненты.
 */
export default function RebuildTimelineButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  return (
    <div className="rounded-card bg-blue-lt border border-blue/20 p-4 flex items-start gap-3">
      <div className="text-[20px] leading-none pt-[2px]">🔄</div>
      <div className="flex-1">
        <div className="text-[13px] font-semibold text-text-main">
          Синхронизация таймлайна из документов
        </div>
        <div className="text-[12px] text-text-sec mt-[2px] leading-[1.45]">
          Схлопнёт дубли Airbnb-броней, подтянет цену в бюджет, добавит
          ссылки на авиакомпании и табло аэропортов, заполнит
          автоописание дня.
        </div>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await rebuildTimelineAction(slug);
            setDone(true);
            router.refresh();
          })
        }
        className="bg-blue text-white rounded-btn px-3 py-[8px] text-[12px] font-medium active:opacity-85 disabled:opacity-60 whitespace-nowrap"
      >
        {pending ? "Обновляем…" : done ? "✓ Готово" : "Обновить"}
      </button>
    </div>
  );
}
