"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ConfirmDeleteButton from "@/components/ConfirmDeleteButton";

type EventSummary = {
  id: string;
  title: string;
  time: string | null;
};

type Props = {
  slug: string;
  dayNumber: number;
  dayTitle: string;
  dayDetail: string;
  dayNumberLabel: string;
  events: EventSummary[];
  updateDayMeta: (fd: FormData) => Promise<void>;
  deleteEvent: (eventId: string) => Promise<unknown>;
  readOnly?: boolean;
};

/**
 * Меню действий дня — скрывает редактирование заголовка/описания
 * и управление событиями под кнопкой «⋯» справа от заголовка
 * таймлайна. Содержит:
 *   • «Редактировать день» — открывает модалку с полями title/detail;
 *   • «Добавить событие» — ссылка на страницу создания события;
 *   • список событий дня с «Изменить»/«Удалить» на каждом.
 */
export default function DayActionsMenu({
  slug,
  dayNumber,
  dayTitle,
  dayDetail,
  dayNumberLabel,
  events,
  updateDayMeta,
  deleteEvent,
  readOnly,
}: Props) {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
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

  return (
    <>
      <div className="relative" ref={rootRef}>
        <button
          type="button"
          aria-label="Действия дня"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center justify-center w-[32px] h-[24px] rounded-badge text-text-mut hover:bg-bg-surface"
        >
          <span
            className="text-[18px] leading-none tracking-[2px]"
            aria-hidden="true"
          >
            ⋯
          </span>
        </button>
        {open && (
          <div className="absolute right-0 top-[28px] z-30 w-[280px] bg-white rounded-card shadow-card border border-black/[0.06] py-1">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setEditOpen(true);
              }}
              className="w-full text-left px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface"
            >
              Редактировать день
            </button>
            {!readOnly && (
              <Link
                href={`/trips/${slug}/days/${dayNumber}/events/new`}
                onClick={() => setOpen(false)}
                className="block px-3 py-[10px] text-[13px] text-text-main hover:bg-bg-surface"
              >
                Добавить событие
              </Link>
            )}
            {events.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-[0.5px] text-text-sec font-semibold border-t border-black/[0.06] mt-1">
                  События
                </div>
                <div className="max-h-[280px] overflow-y-auto">
                  {events.map((e) => (
                    <div
                      key={e.id}
                      className="px-3 py-[8px] border-t border-black/[0.04] first:border-t-0"
                    >
                      <div className="text-[12px] text-text-main font-medium line-clamp-2">
                        {e.time ? (
                          <span className="text-blue font-mono tnum mr-[6px]">
                            {e.time}
                          </span>
                        ) : null}
                        {e.title}
                      </div>
                      {!readOnly && (
                        <div className="flex items-center gap-4 mt-[4px]">
                          <Link
                            href={`/trips/${slug}/days/${dayNumber}/events/${e.id}`}
                            onClick={() => setOpen(false)}
                            className="text-[12px] text-blue"
                          >
                            Изменить
                          </Link>
                          <ConfirmDeleteButton
                            perform={() => deleteEvent(e.id)}
                            label="Удалить"
                            confirmText="Событие будет удалено без возможности восстановить. Введите код доступа."
                            className="text-[12px] text-accent"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {editOpen && (
        <EditDayModal
          dayTitle={dayTitle}
          dayDetail={dayDetail}
          dayNumberLabel={dayNumberLabel}
          updateDayMeta={updateDayMeta}
          onClose={() => setEditOpen(false)}
        />
      )}
    </>
  );
}

function EditDayModal({
  dayTitle,
  dayDetail,
  dayNumberLabel,
  updateDayMeta,
  onClose,
}: {
  dayTitle: string;
  dayDetail: string;
  dayNumberLabel: string;
  updateDayMeta: (fd: FormData) => Promise<void>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] bg-white rounded-card shadow-card p-5 space-y-4"
      >
        <div className="text-[15px] font-semibold text-text-main">
          Редактировать день
        </div>
        <form
          action={async (fd: FormData) => {
            await updateDayMeta(fd);
            onClose();
          }}
          className="space-y-3"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Заголовок дня
            </label>
            <input
              name="title"
              defaultValue={dayTitle}
              placeholder={dayNumberLabel}
              maxLength={120}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Краткое описание
            </label>
            <input
              name="detail"
              defaultValue={dayDetail}
              placeholder="Например: перелёт Москва → Тиват, заселение"
              maxLength={400}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[10px] text-[13px] font-medium text-text-main active:bg-bg-surface"
            >
              Отмена
            </button>
            <button
              type="submit"
              className="flex-1 bg-text-main text-white rounded-btn py-[10px] text-[13px] font-semibold active:opacity-85"
            >
              Сохранить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
