"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildTimelineAction } from "./actions";

/**
 * Компактная иконка-кнопка «Синхронизировать таймлайн» —
 * расположена у заголовка страницы Дней, не занимает экран.
 * Логика та же: дедуп stays, пересоздание событий, автоописание.
 */
export default function RebuildTimelineButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const router = useRouter();

  const label = pending
    ? "Обновляем…"
    : done
    ? "Обновлено"
    : "Обновить таймлайн";

  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await rebuildTimelineAction(slug);
          setDone(true);
          router.refresh();
        })
      }
      className="inline-flex items-center justify-center w-[32px] h-[32px] rounded-[8px] bg-blue-lt text-blue border border-blue/20 hover:bg-blue/15 disabled:opacity-60"
    >
      <span
        className={`text-[16px] leading-none ${
          pending ? "animate-spin" : ""
        }`}
      >
        {done && !pending ? "✓" : "🔄"}
      </span>
    </button>
  );
}
