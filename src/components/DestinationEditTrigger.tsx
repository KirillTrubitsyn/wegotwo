"use client";

import { useState } from "react";
import DestinationEditModal from "@/components/DestinationEditModal";

type PhotoOption = {
  id: string;
  thumbUrl: string | null;
  storagePath: string;
};

type Props = {
  destName: string;
  destDescription: string;
  descriptionSource: "auto" | "manual" | null;
  currentPhotoStoragePath: string | null;
  photos: PhotoOption[];
  save: (fd: FormData) => Promise<{ ok: true } | { ok: false; error: string }>;
  setCover: (
    photoId: string | null
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearManual: () => Promise<{ ok: true } | { ok: false; error: string }>;
};

/**
 * Кнопка «Редактировать» рядом с заголовком города + одна модалка.
 * Изолирует open-state, чтобы серверная страница оставалась чистой.
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
        destName={props.destName}
        destDescription={props.destDescription}
        descriptionSource={props.descriptionSource}
        currentPhotoStoragePath={props.currentPhotoStoragePath}
        photos={props.photos}
        save={props.save}
        setCover={props.setCover}
        clearManual={props.clearManual}
      />
    </>
  );
}
