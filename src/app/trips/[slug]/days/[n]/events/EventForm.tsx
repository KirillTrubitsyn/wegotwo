"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { EventActionState } from "../../actions";

const KINDS: Array<{ value: string; label: string; icon: string }> = [
  { value: "meal", label: "Еда", icon: "🍽" },
  { value: "visit", label: "Место", icon: "📍" },
  { value: "activity", label: "Активити", icon: "🎫" },
  { value: "transfer", label: "Переезд", icon: "🚂" },
  { value: "flight", label: "Перелёт", icon: "✈" },
  { value: "stay", label: "Отель", icon: "🏠" },
  { value: "other", label: "Другое", icon: "•" },
];

type Props = {
  tripSlug: string;
  dayNumber: number;
  action: (
    prev: EventActionState,
    formData: FormData
  ) => Promise<EventActionState>;
  initial?: {
    title?: string;
    kind?: string;
    start_time?: string | null;
    end_time?: string | null;
    notes?: string | null;
    map_url?: string | null;
  };
  submitLabel: string;
};

const empty: EventActionState = { ok: true };

export default function EventForm({
  tripSlug,
  dayNumber,
  action,
  initial,
  submitLabel,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, empty);

  if (state.ok && state !== empty && !pending) {
    // Success: go back to the day detail
    router.push(`/trips/${tripSlug}/days/${dayNumber}`);
    router.refresh();
  }

  const fields = !state.ok ? state.fields ?? {} : {};
  const formErr = !state.ok ? state.form : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      )}

      <Field label="Название" error={fields.title}>
        <input
          name="title"
          defaultValue={initial?.title ?? ""}
          maxLength={120}
          required
          placeholder="Например: обед в Konoba Catovica Mlini"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </Field>

      <div>
        <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-2">
          Тип
        </label>
        <div className="flex flex-wrap gap-2">
          {KINDS.map((k) => (
            <label
              key={k.value}
              className="relative inline-flex items-center"
            >
              <input
                type="radio"
                name="kind"
                value={k.value}
                defaultChecked={(initial?.kind ?? "other") === k.value}
                className="peer sr-only"
              />
              <span className="inline-flex items-center gap-[6px] px-[12px] py-[7px] rounded-badge text-[12px] font-medium bg-bg-surface text-text-sec border border-transparent peer-checked:bg-white peer-checked:border-blue peer-checked:text-text-main cursor-pointer">
                <span>{k.icon}</span>
                {k.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Начало" error={fields.start_time}>
          <input
            name="start_time"
            type="time"
            defaultValue={initial?.start_time ?? ""}
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
          />
        </Field>
        <Field label="Конец" error={fields.end_time}>
          <input
            name="end_time"
            type="time"
            defaultValue={initial?.end_time ?? ""}
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
          />
        </Field>
      </div>

      <Field label="Заметки" error={fields.notes}>
        <textarea
          name="notes"
          defaultValue={initial?.notes ?? ""}
          maxLength={1000}
          rows={4}
          placeholder="Адрес, бронь, телефон, заметка"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none resize-y"
        />
      </Field>

      <Field label="Ссылка на карту" error={fields.map_url}>
        <input
          name="map_url"
          defaultValue={initial?.map_url ?? ""}
          type="url"
          maxLength={500}
          placeholder="https://maps.google.com/?q=..."
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </Field>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() =>
            router.push(`/trips/${tripSlug}/days/${dayNumber}`)
          }
          className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-text-main text-white rounded-btn py-[12px] text-[14px] font-medium active:opacity-85 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
        {label}
      </label>
      {children}
      {error && (
        <div className="text-[12px] text-accent mt-1">{error}</div>
      )}
    </div>
  );
}
