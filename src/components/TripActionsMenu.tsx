"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

type Props = {
  slug: string;
  /** Текущее состояние архива — меняет пункт «В архив» ↔ «Вернуть». */
  archived: boolean;
  /** Server action: тогглит архив поездки. */
  archive: () => Promise<void>;
  /** Server action: удаляет поездку. Вызывается после ввода кода доступа. */
  remove: () => Promise<void>;
};

/**
 * Вертикальное меню «⋮» действий поездки — заменяет нижнюю панель
 * с тремя кнопками (Редактировать / В архив / Удалить поездку).
 * Размещается справа от строки с датами поездки на экране обзора.
 */
export default function TripActionsMenu({
  slug,
  archived,
  archive,
  remove,
}: Props) {
  const [open, setOpen] = useState(false);
  const [archivePending, startArchive] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

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

  const handleArchive = () => {
    setOpen(false);
    startArchive(async () => {
      await archive();
    });
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        aria-label="Действия поездки"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center justify-center w-[28px] h-[28px] -mr-1 rounded-badge text-text-mut hover:bg-bg-surface"
      >
        <span className="text-[18px] leading-none" aria-hidden="true">
          ⋮
        </span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-[32px] z-30 w-[220px] bg-white rounded-card shadow-card border border-black/[0.06] py-1"
        >
          <Link
            href={`/trips/${slug}/edit`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="block px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface"
          >
            Редактировать
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={handleArchive}
            disabled={archivePending}
            className="w-full text-left px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface disabled:opacity-60 border-t border-black/[0.04]"
          >
            {archivePending
              ? archived
                ? "Возвращаем…"
                : "Архивируем…"
              : archived
              ? "Вернуть"
              : "В архив"}
          </button>
          <div className="border-t border-black/[0.04]">
            <ConfirmDeleteButton
              perform={remove}
              label="Удалить поездку"
              confirmText="Все дни, события, документы, фото и расходы поездки будут удалены без возможности восстановить. Введите код доступа."
              className="w-full text-left px-3 py-[10px] text-[13px] text-accent hover:bg-red-lt"
            />
          </div>
        </div>
      )}
    </div>
  );
}
