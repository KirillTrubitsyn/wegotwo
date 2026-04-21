"use client";

import { useActionState, useState } from "react";
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
    airline?: string | null;
    flight_code?: string | null;
    from_code?: string | null;
    to_code?: string | null;
    terminal?: string | null;
    seat?: string | null;
    pnr?: string | null;
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
  const [kind, setKind] = useState<string>(initial?.kind ?? "other");

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
                onChange={(e) => setKind(e.currentTarget.value)}
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

      {kind === "flight" && (
        <div className="space-y-3 rounded-btn bg-bg-surface/60 p-3">
          <div className="text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold">
            Рейс
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Авиакомпания">
              <input
                name="airline"
                defaultValue={initial?.airline ?? ""}
                maxLength={80}
                placeholder="Air Serbia"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
              />
            </Field>
            <Field label="Номер рейса">
              <input
                name="flight_code"
                defaultValue={initial?.flight_code ?? ""}
                maxLength={20}
                placeholder="JU 134"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
              />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Откуда (IATA)" error={fields.from_code}>
              <input
                name="from_code"
                defaultValue={initial?.from_code ?? ""}
                maxLength={3}
                placeholder="BEG"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none uppercase"
              />
            </Field>
            <Field label="Куда (IATA)" error={fields.to_code}>
              <input
                name="to_code"
                defaultValue={initial?.to_code ?? ""}
                maxLength={3}
                placeholder="SVO"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none uppercase"
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Терминал">
              <input
                name="terminal"
                defaultValue={initial?.terminal ?? ""}
                maxLength={40}
                placeholder="2"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
              />
            </Field>
            <Field label="Места">
              <input
                name="seat"
                defaultValue={initial?.seat ?? ""}
                maxLength={50}
                placeholder="12A, 12B"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
              />
            </Field>
            <Field label="PNR">
              <input
                name="pnr"
                defaultValue={initial?.pnr ?? ""}
                maxLength={20}
                placeholder="ABCD12"
                className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none uppercase"
              />
            </Field>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-2">
              Кнопки на карточке
            </label>
            <div className="space-y-2">
              <LinkToggle
                name="include_airline"
                label="Сайт авиакомпании"
                defaultChecked
              />
              <LinkToggle
                name="include_board_from"
                label="Табло аэропорта вылета"
                defaultChecked
              />
              <LinkToggle
                name="include_board_to"
                label="Табло аэропорта прилёта"
                defaultChecked
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-2">
              Свои ссылки
            </label>
            <div className="space-y-2">
              <ExtraLinkRow index={1} />
              <ExtraLinkRow index={2} />
              <ExtraLinkRow index={3} />
            </div>
          </div>

          <p className="text-[11px] text-text-sec">
            Название события пишется в «Название» сверху. Например: «Air Serbia JU 134: Белград → Москва».
          </p>
        </div>
      )}

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

function LinkToggle({
  name,
  label,
  defaultChecked,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-text-main cursor-pointer">
      <input
        type="checkbox"
        name={name}
        defaultChecked={defaultChecked}
        className="h-4 w-4 accent-blue"
      />
      {label}
    </label>
  );
}

function ExtraLinkRow({ index }: { index: number }) {
  return (
    <div className="grid grid-cols-[1fr_2fr] gap-2">
      <input
        name={`extra_label_${index}`}
        maxLength={40}
        placeholder="Название"
        className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
      />
      <input
        name={`extra_url_${index}`}
        type="url"
        maxLength={500}
        placeholder="https://..."
        className="w-full bg-white rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:outline-none"
      />
    </div>
  );
}
