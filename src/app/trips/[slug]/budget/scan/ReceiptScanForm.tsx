"use client";

/**
 * Экран захвата чека.
 *
 * Реализован через ДВА input-элемента:
 *   - «Снять чек» → <input capture="environment"> (камера, только
 *     телефон/tablet, десктоп fallback = выбор файла).
 *   - «Из галереи» → обычный <input type="file" accept="image/*">.
 *
 * Это решение даёт самый надёжный UX на iOS Safari, Android Chrome
 * и десктопе: на iOS первая кнопка открывает камеру напрямую (без
 * bottom-sheet с тремя опциями), вторая — Photos library.
 *
 * После выбора файла прогоняем его через normalizeHeic (iPhone HEIC
 * конвертируем в JPEG клиентом, чтобы не гонять 3–5 МБ HEIC на сервер),
 * показываем превью и при сабмите отправляем одно поле file в action.
 */

import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { normalizeHeic } from "@/lib/photos/exif";
import { formatBytes } from "@/lib/docs/labels";
import type { ScanUploadState } from "./actions";

type Props = {
  action: (
    prev: ScanUploadState,
    fd: FormData
  ) => Promise<ScanUploadState>;
  baseCurrency: string;
};

const INITIAL: ScanUploadState = { ok: true };

export default function ReceiptScanForm({ action, baseCurrency }: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, INITIAL);

  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const hiddenFileRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  async function onPick(raw: File | null) {
    setPickError(null);
    if (!raw) return;
    if (!raw.type.startsWith("image/") && !/\.(heic|heif)$/i.test(raw.name)) {
      setPickError("Нужна фотография. Для PDF используйте «Документы».");
      return;
    }
    setProcessing(true);
    try {
      // iPhone HEIC → JPEG клиентом. Для не-HEIC форматов вернёт
      // исходный File без копирования.
      const norm = await normalizeHeic(raw);
      setFile(norm);

      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const url = URL.createObjectURL(norm);
      setPreviewUrl(url);

      // Пробрасываем готовый файл в скрытый input, чтобы action
      // получил именно нормализованный JPEG, а не HEIC.
      if (hiddenFileRef.current) {
        const dt = new DataTransfer();
        dt.items.add(norm);
        hiddenFileRef.current.files = dt.files;
      }
    } catch (e) {
      setPickError(
        e instanceof Error ? e.message : "Не удалось обработать изображение"
      );
    } finally {
      setProcessing(false);
    }
  }

  function reset() {
    setFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (hiddenFileRef.current) hiddenFileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
    if (galleryRef.current) galleryRef.current.value = "";
  }

  const formErr = !state.ok ? state.form : undefined;

  return (
    <form action={formAction} className="space-y-4">
      <p className="text-[13px] text-text-sec">
        Сфотографируйте чек. Мы распознаем сумму, дату, валюту и категорию,
        а вы подтвердите перед сохранением. Валюта по умолчанию —{" "}
        <strong className="text-text-main">{baseCurrency}</strong>.
      </p>

      {previewUrl ? (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Предпросмотр чека"
            className="w-full max-h-[520px] object-contain bg-black/5"
          />
          <div className="flex items-center justify-between px-4 py-3 text-[12px] text-text-sec">
            <div className="truncate">
              {file?.name ?? "receipt.jpg"}
              {file ? ` · ${formatBytes(file.size)}` : ""}
            </div>
            <button
              type="button"
              onClick={reset}
              className="text-blue underline-offset-2 hover:underline"
            >
              Сбросить
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-card shadow-card p-5 space-y-3">
          <div className="text-[13px] text-text-sec">
            Выберите источник:
          </div>
          <button
            type="button"
            onClick={() => cameraRef.current?.click()}
            disabled={processing}
            className="w-full bg-text-main text-white rounded-btn py-[14px] text-[14px] font-semibold active:opacity-85 disabled:opacity-60"
          >
            📸 Снять чек
          </button>
          <button
            type="button"
            onClick={() => galleryRef.current?.click()}
            disabled={processing}
            className="w-full bg-white border border-black/[0.08] rounded-btn py-[14px] text-[14px] font-medium text-text-main active:bg-bg-surface disabled:opacity-60"
          >
            🖼 Выбрать из галереи
          </button>

          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={(ev) => onPick(ev.target.files?.[0] ?? null)}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*,image/heic,image/heif"
            className="sr-only"
            onChange={(ev) => onPick(ev.target.files?.[0] ?? null)}
          />
        </div>
      )}

      {/* Скрытый input, в который клиент кладёт нормализованный JPEG. */}
      <input
        ref={hiddenFileRef}
        type="file"
        name="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
      />

      {pickError ? (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {pickError}
        </div>
      ) : null}
      {formErr ? (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      ) : null}
      {processing ? (
        <div className="text-[13px] text-text-sec">Обрабатываем изображение…</div>
      ) : null}

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending || processing || !file}
          className="flex-1 bg-blue text-white rounded-btn py-[12px] text-[14px] font-semibold active:bg-blue/90 disabled:opacity-50"
        >
          {pending ? "Отправляем…" : "Распознать"}
        </button>
      </div>
    </form>
  );
}
