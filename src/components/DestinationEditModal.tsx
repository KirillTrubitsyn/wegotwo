"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type PhotoOption = {
  id: string;
  thumbUrl: string | null;
  storagePath: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  destName: string;
  destDescription: string;
  descriptionSource: "auto" | "manual" | null;
  currentPhotoStoragePath: string | null;
  photos: PhotoOption[];
  /** Сохранить name + description (FormData, см. updateDestinationAction). */
  save: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Назначить/снять обложку. photoId=null убирает обложку. */
  setCover: (
    photoId: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** Сбросить description_source в auto, чтобы reparse мог переписать. */
  clearManual: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Модалка редактирования города. Поля:
 *   • название;
 *   • описание (textarea, markdown — пока plain-text c переносами);
 *   • выбор обложки из загруженных в поездку фотографий
 *     (3-колоночная сетка миниатюр + опция «без обложки»).
 *
 * Обложка сохраняется отдельным экшеном в момент клика — это даёт
 * мгновенный визуальный фидбек без отправки формы. Имя и описание
 * сохраняются по кнопке «Сохранить».
 */
export default function DestinationEditModal({
  open,
  onClose,
  destName,
  destDescription,
  descriptionSource,
  currentPhotoStoragePath,
  photos,
  save,
  setCover,
  clearManual,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [coverPath, setCoverPath] = useState(currentPhotoStoragePath);
  const [coverPending, setCoverPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCoverPath(currentPhotoStoragePath);
  }, [currentPhotoStoragePath]);

  useEffect(() => {
    if (!open) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending && !coverPending) onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [open, pending, coverPending, onClose]);

  if (!open) return null;

  const onPickCover = (photoId: string | null) => {
    setCoverPending(true);
    setError(null);
    void (async () => {
      const res = await setCover(photoId);
      if (!res.ok) {
        setError(res.error);
      } else {
        const photo = photoId
          ? photos.find((p) => p.id === photoId) ?? null
          : null;
        setCoverPath(photo?.storagePath ?? null);
        router.refresh();
      }
      setCoverPending(false);
    })();
  };

  const onClearManual = () => {
    setError(null);
    startTransition(async () => {
      const res = await clearManual();
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4 overflow-y-auto"
      onClick={() => {
        if (!pending && !coverPending) onClose();
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] bg-white rounded-card shadow-card p-5 space-y-4 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between">
          <div className="text-[15px] font-semibold text-text-main">
            Редактировать город
          </div>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            disabled={pending || coverPending}
            className="w-8 h-8 -mr-2 rounded-full text-text-mut hover:bg-bg-surface disabled:opacity-60"
          >
            ✕
          </button>
        </div>

        <form
          action={(fd) => {
            setError(null);
            startTransition(async () => {
              const res = await save(fd);
              if (!res.ok) {
                setError(res.error);
                return;
              }
              router.refresh();
              onClose();
            });
          }}
          className="space-y-4"
        >
          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
              Название
            </label>
            <input
              name="name"
              defaultValue={destName}
              maxLength={120}
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
              required
            />
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1">
              <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold">
                Описание
              </label>
              {descriptionSource === "manual" && (
                <button
                  type="button"
                  onClick={onClearManual}
                  disabled={pending || coverPending}
                  className="text-[11px] text-blue hover:underline disabled:opacity-60"
                  title="Разрешить Gemini перезаписать это описание при следующем reparse документов"
                >
                  Сбросить на авто
                </button>
              )}
              {descriptionSource === "auto" && (
                <span
                  className="text-[10px] uppercase tracking-[0.5px] text-text-mut"
                  title="Описание подтянуто из документа через Gemini. Любая правка переключит источник на ручной."
                >
                  AUTO
                </span>
              )}
            </div>
            <textarea
              name="description"
              defaultValue={destDescription}
              rows={6}
              maxLength={4000}
              placeholder="Краткий обзор города. Подтянется из документа или впишите сами."
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[13px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none leading-[1.5] resize-y"
            />
            <div className="text-[11px] text-text-mut mt-1">
              Markdown с минимальной разметкой: абзацы, **жирное**, *курсив*.
            </div>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-2">
              <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold">
                Обложка
              </label>
              {coverPath && (
                <button
                  type="button"
                  onClick={() => onPickCover(null)}
                  disabled={pending || coverPending}
                  className="text-[11px] text-text-sec hover:text-accent disabled:opacity-60"
                >
                  Убрать обложку
                </button>
              )}
            </div>
            {photos.length === 0 ? (
              <div className="text-[12px] text-text-sec bg-bg-surface rounded-btn px-3 py-3">
                В поездке пока нет фотографий. Загрузите фото на вкладке
                «Фото», чтобы выбрать обложку.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-[6px]">
                {photos.map((p) => {
                  const isCover = coverPath === p.storagePath;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onPickCover(p.id)}
                      disabled={pending || coverPending}
                      className={`relative aspect-square rounded-btn overflow-hidden border-2 ${
                        isCover
                          ? "border-blue ring-2 ring-blue/30"
                          : "border-transparent"
                      } disabled:opacity-60`}
                      aria-label={
                        isCover ? "Текущая обложка" : "Сделать обложкой"
                      }
                    >
                      {p.thumbUrl ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={p.thumbUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-bg-surface" />
                      )}
                      {isCover && (
                        <span className="absolute top-1 right-1 bg-blue text-white text-[9px] font-bold px-[5px] py-[1px] rounded-badge">
                          ★
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error && (
            <div className="text-[12px] text-accent bg-red-lt rounded-btn px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={pending || coverPending}
              className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[10px] text-[13px] font-medium text-text-main active:bg-bg-surface disabled:opacity-60"
            >
              Отмена
            </button>
            <button
              type="submit"
              disabled={pending || coverPending}
              className="flex-1 bg-text-main text-white rounded-btn py-[10px] text-[13px] font-semibold active:opacity-85 disabled:opacity-60"
            >
              {pending ? "Сохраняем…" : "Сохранить"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
