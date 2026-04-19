"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { extractExif, normalizeHeic } from "@/lib/photos/exif";
import type { PhotoActionState } from "./actions";

type Props = {
  tripSlug: string;
  action: (
    prev: PhotoActionState,
    fd: FormData
  ) => Promise<PhotoActionState>;
};

const empty: PhotoActionState = { ok: true };

type Prepared = {
  file: File;
  previewUrl: string;
  takenAt: string | null;
  lat: number | null;
  lon: number | null;
};

async function prepare(rawFile: File): Promise<Prepared> {
  // Read EXIF BEFORE heic2any, since conversion often drops metadata.
  const exif = await extractExif(rawFile);
  const file = await normalizeHeic(rawFile);
  const previewUrl = URL.createObjectURL(file);
  return {
    file,
    previewUrl,
    takenAt: exif.takenAt,
    lat: exif.lat,
    lon: exif.lon,
  };
}

export default function PhotoUploader({ tripSlug, action }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, empty);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [caption, setCaption] = useState("");

  const formErr = !state.ok ? state.form : undefined;
  const fileErr = !state.ok ? state.fields?.file : undefined;

  async function onPick(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.currentTarget.files?.[0];
    if (!f) return;
    setPreparing(true);
    try {
      const prepped = await prepare(f);
      if (prepared?.previewUrl) URL.revokeObjectURL(prepared.previewUrl);
      setPrepared(prepped);
    } finally {
      setPreparing(false);
    }
  }

  async function onSubmit(fd: FormData) {
    if (!prepared) return;
    fd.set("file", prepared.file, prepared.file.name);
    if (prepared.takenAt) fd.set("taken_at", prepared.takenAt);
    if (prepared.lat != null) fd.set("lat", String(prepared.lat));
    if (prepared.lon != null) fd.set("lon", String(prepared.lon));
    fd.set("caption", caption);
    return formAction(fd);
  }

  return (
    <form action={onSubmit} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      )}

      <div>
        <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
          Фото
        </label>
        <label className="block bg-bg-surface rounded-btn px-3 py-[14px] border border-dashed border-black/[0.12] text-center cursor-pointer active:bg-black/[0.04]">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            required
            className="sr-only"
            onChange={onPick}
          />
          <span className="text-[14px] text-text-main font-medium">
            {preparing
              ? "Подготовка…"
              : prepared
              ? prepared.file.name
              : "Выбрать фото"}
          </span>
          <div className="text-[12px] text-text-sec mt-1">
            JPG, PNG, WebP, HEIC. До 30 МБ.
          </div>
        </label>
        {fileErr && (
          <div className="text-[12px] text-accent mt-1">{fileErr}</div>
        )}
      </div>

      {prepared && (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={prepared.previewUrl}
            alt="preview"
            className="w-full h-auto block max-h-[380px] object-contain bg-black/[0.02]"
          />
          <div className="p-3 text-[12px] text-text-sec">
            {prepared.takenAt
              ? `Снято: ${new Date(prepared.takenAt).toLocaleString(
                  "ru-RU"
                )}`
              : "Дата снимка недоступна — фото попадёт в «Без даты»."}
            {prepared.lat != null && prepared.lon != null
              ? ` · ${prepared.lat.toFixed(4)}, ${prepared.lon.toFixed(4)}`
              : ""}
          </div>
        </div>
      )}

      <div>
        <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
          Подпись
        </label>
        <input
          type="text"
          value={caption}
          onChange={(ev) => setCaption(ev.currentTarget.value)}
          maxLength={300}
          placeholder="Необязательно"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/trips/${tripSlug}/photos`)}
          className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending || !prepared || preparing}
          className="flex-1 bg-text-main text-white rounded-btn py-[12px] text-[14px] font-medium active:opacity-85 disabled:opacity-50"
        >
          {pending ? "Загружаем…" : "Загрузить"}
        </button>
      </div>
    </form>
  );
}
