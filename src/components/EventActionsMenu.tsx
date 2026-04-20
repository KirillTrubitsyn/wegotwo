"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

type Props = {
  /** Link to the edit page — invoked from a "Изменить" menu item. */
  editHref: string;
  /** Server action that deletes the event. */
  deletePerform: () => Promise<unknown>;
};

/**
 * Кнопка «⋯» на карточке события таймлайна. Скрывает «Изменить»
 * и «Удалить» в popover-меню, чтобы на самой карточке оставались
 * только полезные для чтения кнопки (бронь, табло, билет, карты).
 *
 * «Удалить» внутри меню использует `ConfirmDeleteButton` — требует
 * ввода кода доступа.
 */
export default function EventActionsMenu({
  editHref,
  deletePerform,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label="Действия"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-[32px] h-[28px] rounded-badge border border-black/10 text-text-sec hover:bg-bg-surface"
      >
        <span className="text-[18px] leading-none" aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div className="absolute right-0 top-[34px] z-20 min-w-[160px] bg-white rounded-card shadow-card border border-black/[0.06] py-1">
          <Link
            href={editHref}
            onClick={() => setOpen(false)}
            className="block px-3 py-[9px] text-[13px] text-text-main hover:bg-bg-surface"
          >
            Изменить
          </Link>
          <div className="px-3 py-1">
            <ConfirmDeleteButton
              perform={deletePerform}
              label="Удалить"
              confirmText="Событие будет удалено без возможности восстановить. Введите код доступа."
              className="w-full text-left text-[13px] text-accent py-[6px]"
            />
          </div>
        </div>
      )}
    </div>
  );
}
