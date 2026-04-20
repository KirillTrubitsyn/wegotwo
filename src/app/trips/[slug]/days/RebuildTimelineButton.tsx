"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  rebuildTimelineAction,
  reparseDocumentsAction,
} from "./actions";

/**
 * Две компактные иконки-кнопки над списком дней:
 *   🔄 — быстро пересобрать события из текущих parsed_fields
 *        (дедуп stays, обновление ссылок, автоописание дня).
 *   🧠 — перечитать все документы через Gemini с актуальным
 *        system-prompt (дорого, используется после изменения
 *        схемы — вытащит guide_name, paid/due, time и др.).
 */
export default function RebuildTimelineButton({ slug }: { slug: string }) {
  const [rebuildPending, startRebuild] = useTransition();
  const [reparsePending, startReparse] = useTransition();
  const [done, setDone] = useState<"rebuild" | "reparse" | null>(null);
  const router = useRouter();

  const triggerRebuild = () =>
    startRebuild(async () => {
      await rebuildTimelineAction(slug);
      setDone("rebuild");
      router.refresh();
    });

  const triggerReparse = () => {
    if (
      !confirm(
        "Перечитать все документы через Gemini? Это займёт до минуты и делает ~N платных вызовов ИИ (по одному на документ)."
      )
    )
      return;
    startReparse(async () => {
      const res = await reparseDocumentsAction(slug);
      setDone("reparse");
      if (res.ok) {
        alert(
          `Перечитано: ${res.reparsed}. Ошибок: ${res.failed}. Таймлайн обновлён.`
        );
      } else {
        alert(`Ошибка: ${res.error}`);
      }
      router.refresh();
    });
  };

  return (
    <div className="flex items-center gap-[6px]">
      <button
        type="button"
        title={
          rebuildPending
            ? "Обновляем…"
            : "Пересобрать таймлайн из текущих данных"
        }
        aria-label="Пересобрать таймлайн"
        disabled={rebuildPending || reparsePending}
        onClick={triggerRebuild}
        className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-blue-lt text-blue border border-blue/20 hover:bg-blue/15 disabled:opacity-60"
      >
        <span
          className={`text-[16px] leading-none ${
            rebuildPending ? "animate-spin" : ""
          }`}
        >
          {done === "rebuild" && !rebuildPending ? "✓" : "🔄"}
        </span>
      </button>
      <button
        type="button"
        title={
          reparsePending
            ? "Перечитываем ИИ…"
            : "Перечитать все документы через Gemini (дорого)"
        }
        aria-label="Перечитать документы"
        disabled={rebuildPending || reparsePending}
        onClick={triggerReparse}
        className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-gold-lt text-[#8a6200] border border-gold/30 hover:bg-gold/25 disabled:opacity-60"
      >
        <span
          className={`text-[16px] leading-none ${
            reparsePending ? "animate-pulse" : ""
          }`}
        >
          {done === "reparse" && !reparsePending ? "✓" : "🧠"}
        </span>
      </button>
    </div>
  );
}
