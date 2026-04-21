"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildTimelineAction } from "./actions";

type ReparseProgress = {
  total: number;
  done: number;
  failed: number;
};

/**
 * Меню «⋯» над списком дней: скрывает два действия под одной
 * кнопкой в хэдере.
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
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onEsc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const triggerRebuild = () => {
    setOpen(false);
    startRebuild(async () => {
      await rebuildTimelineAction(slug);
      setDone("rebuild");
      router.refresh();
    });
  };

  const triggerReparse = async () => {
    setOpen(false);
    if (
      !confirm(
        "Перечитать все документы через Gemini? Это займёт несколько минут (по ~10–30 сек на документ) и делает платные вызовы ИИ."
      )
    )
      return;

    setReparsePending(true);
    setProgress(null);
    try {
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

      const CONCURRENCY = 3;
      let doneN = 0;
      let failed = 0;
      setProgress({ total: ids.length, done: 0, failed: 0 });

      const processOne = async (id: string) => {
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
      };

      for (let i = 0; i < ids.length; i += CONCURRENCY) {
        const chunk = ids.slice(i, i + CONCURRENCY);
        await Promise.all(chunk.map(processOne));
      }

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

  const busy = rebuildPending || reparsePending;
  const triggerLabel = rebuildPending
    ? "🔄"
    : reparsePending && progress
    ? `${progress.done}/${progress.total}`
    : reparsePending
    ? "🧠"
    : "⋯";

  const reparseMenuLabel = reparsePending
    ? progress
      ? `Перечитываем документы… ${progress.done}/${progress.total}`
      : "Перечитываем документы…"
    : done === "reparse"
    ? "Документы перечитаны ✓"
    : "Перечитать документы через Gemini";

  const rebuildMenuLabel = rebuildPending
    ? "Пересобираем таймлайн…"
    : done === "rebuild"
    ? "Таймлайн пересобран ✓"
    : "Пересобрать таймлайн";

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Действия поездки"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center min-w-[32px] h-[32px] px-[6px] rounded-[10px] text-text-mut hover:bg-bg-surface"
      >
        <span
          className={`text-[18px] leading-none tracking-[2px] tnum ${
            rebuildPending ? "animate-spin" : ""
          } ${reparsePending && !progress ? "animate-pulse" : ""}`}
          aria-hidden="true"
        >
          {triggerLabel}
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[36px] z-30 w-[280px] bg-white rounded-card shadow-card border border-black/[0.06] py-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={triggerRebuild}
            disabled={busy}
            className="w-full text-left px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface disabled:opacity-60 flex items-center gap-[10px]"
          >
            <span className="text-[16px] leading-none">🔄</span>
            <span>{rebuildMenuLabel}</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={triggerReparse}
            disabled={busy}
            className="w-full text-left px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface disabled:opacity-60 flex items-center gap-[10px] border-t border-black/[0.04]"
          >
            <span className="text-[16px] leading-none">🧠</span>
            <span>{reparseMenuLabel}</span>
          </button>
        </div>
      )}
    </div>
  );
}
