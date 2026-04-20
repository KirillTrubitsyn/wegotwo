"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { rebuildTimelineAction } from "./actions";

/**
 * Кнопка «Обновить таймлайн» на странице дней. Запускает
 * дедуп stays + пересборку событий + регенерацию дневных описаний
 * через серверный экшен, чтобы пользователь не трогал терминал.
 *
 * Отдельный клиентский компонент нужен только ради `useTransition` —
 * пока серверный экшен в работе, мы показываем «Обновляем…», а
 * `router.refresh()` после завершения перечитывает серверные
 * компоненты и подтягивает обновлённые события/описания.
 */
export default function RebuildTimelineButton({ slug }: { slug: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await rebuildTimelineAction(slug);
          router.refresh();
        })
      }
      className="text-[12px] font-medium text-blue disabled:opacity-60"
    >
      {pending ? "Обновляем…" : "↻ Обновить таймлайн"}
    </button>
  );
}
