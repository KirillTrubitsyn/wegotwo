"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildTimelineAction } from "./actions";

type ReparseProgress = {
  total: number;
  done: number;
  failed: number;
};

/**
 * Две компактные иконки-кнопки над списком дней:
 *   🔄 — быстро пересобрать события из текущих parsed_fields.
 *   🧠 — перечитать все документы через Gemini (итеративно, по
 *        одному через /api/trips/{slug}/reparse/one, чтобы не
 *        упираться в Vercel function timeout и показывать
 *        прогресс N/M). В конце — rebuild.
 */
export default function RebuildTimelineButton({ slug }: { slug: string }) {
  const [rebuildPending, startRebuild] = useTransition();
  const [reparsePending, setReparsePending] = useState(false);
  const [progress, setProgress] = useState<ReparseProgress | null>(null);
  const [done, setDone] = useState<"rebuild" | "reparse" | null>(null);
  const router = useRouter();

  const triggerRebuild = () =>
    startRebuild(async () => {
      await rebuildTimelineAction(slug);
      setDone("rebuild");
      router.refresh();
    });

  const triggerReparse = async () => {
    if (
      !confirm(
        "Перечитать все документы через Gemini? Это займёт несколько минут (по ~10–30 сек на документ) и делает платные вызовы ИИ."
      )
    )
      return;

    setReparsePending(true);
    setProgress(null);
    try {
      // 1. Получить список docId.
      const listRes = await fetch(`/api/trips/${slug}/reparse/list`, {
        method: "GET",
      });
      const listData = (await listRes.json()) as {
        ok: boolean;
        doc_ids?: string[];
        error?: string;
      };
      if (!listData.ok || !listData.doc_ids) {
        alert(`Ошибка: ${listData.error ?? "не удалось получить список"}`);
        return;
      }
      const ids = listData.doc_ids;
      if (ids.length === 0) {
        alert("Нет документов для перечитывания.");
        return;
      }

      // 2. По очереди прогоняем каждый документ.
      let doneN = 0;
      let failed = 0;
      setProgress({ total: ids.length, done: 0, failed: 0 });
      for (const id of ids) {
        try {
          const r = await fetch(`/api/trips/${slug}/reparse/one`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ doc_id: id }),
          });
          const data = (await r.json()) as { ok: boolean; error?: string };
          if (!data.ok) {
            console.error(`[reparse] ${id}:`, data.error);
            failed++;
          }
        } catch (e) {
          console.error(`[reparse] ${id} network:`, e);
          failed++;
        }
        doneN++;
        setProgress({ total: ids.length, done: doneN, failed });
      }

      // 3. Финальный rebuild, чтобы собранные tour_details попали на события.
      await rebuildTimelineAction(slug);
      setDone("reparse");
      alert(
        `Готово. Обработано: ${doneN - failed} из ${ids.length}${
          failed > 0 ? `, ошибок: ${failed}` : ""
        }.`
      );
      router.refresh();
    } finally {
      setReparsePending(false);
      setProgress(null);
    }
  };

  const reparseLabel = progress
    ? `${progress.done}/${progress.total}`
    : done === "reparse" && !reparsePending
    ? "✓"
    : "🧠";

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
            ? `Перечитываем: ${progress?.done ?? 0}/${progress?.total ?? 0}`
            : "Перечитать все документы через Gemini"
        }
        aria-label="Перечитать документы"
        disabled={rebuildPending || reparsePending}
        onClick={triggerReparse}
        className="inline-flex items-center justify-center min-w-[32px] h-[32px] px-[6px] rounded-[8px] bg-gold-lt text-[#8a6200] border border-gold/30 hover:bg-gold/25 disabled:opacity-60"
      >
        <span
          className={`text-[13px] leading-none font-semibold tnum ${
            reparsePending && !progress ? "animate-pulse" : ""
          }`}
        >
          {reparseLabel}
        </span>
      </button>
    </div>
  );
}
