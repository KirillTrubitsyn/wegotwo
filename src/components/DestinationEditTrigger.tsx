"use client";

import { useState } from "react";
import DestinationEditModal from "@/components/DestinationEditModal";

type Props = {
  tripSlug: string;
  destId: string;
  destName: string;
  destDescription: string;
  descriptionSource: "auto" | "manual" | null;
  currentPhotoStoragePath: string | null;
  save: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  setCover: (
    photoId: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearManual: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Кнопка «Редактировать» рядом с заголовком города + одна модалка.
 * Изолирует open-state, чтобы серверная страница оставалась чистой.
 *
 * Список фотографий для пикера обложки больше не передаётся пропсами.
 * Модалка сама подтягивает их при открытии — это убирает 120
 * `createSignedUrls` round-trip'ов на каждом server render страницы.
 */
export default function DestinationEditTrigger(props: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-[5px] px-[12px] py-[6px] rounded-badge text-[12px] font-medium bg-bg-surface text-text-sec hover:bg-black/[0.06]"
      >
        <span aria-hidden="true">✎</span>
        <span>Редактировать</span>
      </button>
      <DestinationEditModal
        open={open}
        onClose={() => setOpen(false)}
        tripSlug={props.tripSlug}
        destId={props.destId}
        destName={props.destName}
        destDescription={props.destDescription}
        descriptionSource={props.descriptionSource}
        currentPhotoStoragePath={props.currentPhotoStoragePath}
        save={props.save}
        setCover={props.setCover}
        clearManual={props.clearManual}
      />
    </>
  );
}
