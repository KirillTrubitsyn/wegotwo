"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { TRIP_COLORS, swatch, type TripColor } from "@/lib/trip-colors";
import { useWeather } from "@/lib/hooks/useWeather";
import { tzCoords } from "@/lib/tz-coords";
import type { TripActionState } from "./actions";

const CURRENCIES = ["RUB", "EUR", "USD", "CHF", "GBP"] as const;

const TZ_PRESETS = [
  { value: "Europe/Moscow", label: "Москва, MSK" },
  { value: "Europe/Podgorica", label: "Подгорица, CET" },
  { value: "Europe/Paris", label: "Париж, CET" },
  { value: "Europe/Berlin", label: "Берлин, CET" },
  { value: "Europe/London", label: "Лондон, GMT" },
  { value: "Europe/Istanbul", label: "Стамбул, TRT" },
  { value: "Asia/Dubai", label: "Дубай, GST" },
  { value: "Asia/Tokyo", label: "Токио, JST" },
];

type Initial = {
  title?: string;
  slug?: string;
  subtitle?: string;
  country?: string;
  date_from?: string;
  date_to?: string;
  base_currency?: string;
  primary_tz?: string;
  color?: TripColor | string;
  route_summary?: string;
};

type Props = {
  action: (state: TripActionState, formData: FormData) => Promise<TripActionState>;
  initial?: Initial;
  submitLabel?: string;
};

function slugify(input: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
    з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
    п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
    ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu",
    я: "ya",
  };
  return input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export default function TripForm({
  action,
  initial,
  submitLabel = "Сохранить",
}: Props) {
  const [state, formAction, pending] = useActionState<TripActionState, FormData>(
    action,
    { ok: true }
  );
  const fieldErr = state.ok ? undefined : state.fields;
  const formErr = state.ok ? undefined : state.form;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [color, setColor] = useState<string>(initial?.color ?? "blue");
  const [primaryTz, setPrimaryTz] = useState(initial?.primary_tz ?? "Europe/Moscow");
  const slugTouched = useRef(!!initial?.slug);

  const tzC = tzCoords(primaryTz);
  const weather = useWeather({ timezone: primaryTz, lat: tzC?.lat, lon: tzC?.lon });

  useEffect(() => {
    if (!slugTouched.current) {
      setSlug(slugify(title));
    }
  }, [title]);

  return (
    <form action={formAction} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt text-accent border border-accent/15 rounded-btn px-4 py-3 text-[13px]">
          {formErr}
        </div>
      )}

      <Field label="Название" error={fieldErr?.title}>
        <input
          name="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Черногория · май 2026"
          className="input"
          required
          maxLength={80}
        />
      </Field>

      <Field label="Slug" hint="Используется в URL" error={fieldErr?.slug}>
        <input
          name="slug"
          value={slug}
          onChange={(e) => {
            slugTouched.current = true;
            setSlug(e.target.value.toLowerCase());
          }}
          placeholder="montenegro-2026"
          className="input font-mono"
          required
          maxLength={48}
          pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
        />
      </Field>

      <Field label="Подзаголовок" error={fieldErr?.subtitle}>
        <input
          name="subtitle"
          defaultValue={initial?.subtitle}
          placeholder="Тиват и Бар"
          className="input"
          maxLength={160}
        />
      </Field>

      <Field label="Страна" error={fieldErr?.country}>
        <input
          name="country"
          defaultValue={initial?.country}
          placeholder="Черногория"
          className="input"
          maxLength={48}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="С" error={fieldErr?.date_from}>
          <input
            type="date"
            name="date_from"
            defaultValue={initial?.date_from}
            className="input"
            required
          />
        </Field>
        <Field label="По" error={fieldErr?.date_to}>
          <input
            type="date"
            name="date_to"
            defaultValue={initial?.date_to}
            className="input"
            required
          />
        </Field>
      </div>

      <Field label="Базовая валюта" error={fieldErr?.base_currency}>
        <select
          name="base_currency"
          defaultValue={initial?.base_currency ?? "EUR"}
          className="input"
        >
          {CURRENCIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Часовой пояс" error={fieldErr?.primary_tz}>
        <select
          name="primary_tz"
          value={primaryTz}
          onChange={(e) => setPrimaryTz(e.target.value)}
          className="input"
        >
          {TZ_PRESETS.map((tz) => (
            <option key={tz.value} value={tz.value}>
              {tz.label}
            </option>
          ))}
        </select>
        {weather && (
          <div className="mt-2 flex items-center gap-[6px] text-[13px] text-text-sec">
            <span className="text-[16px] leading-none">{weather.icon}</span>
            <span className="font-mono font-bold text-text-main">
              {weather.temperature > 0 ? "+" : ""}
              {weather.temperature}°
            </span>
            <span>{weather.description}</span>
          </div>
        )}
      </Field>

      <Field label="Акцентный цвет" error={fieldErr?.color}>
        <input type="hidden" name="color" value={color} />
        <div className="flex items-center gap-[8px]">
          {TRIP_COLORS.map((key) => {
            const s = swatch(key);
            const active = color === key;
            return (
              <button
                key={key}
                type="button"
                aria-label={s.label}
                title={s.label}
                onClick={() => setColor(key)}
                className={`flex-1 aspect-square max-w-[40px] rounded-full ${s.bg} transition-transform ${
                  active
                    ? "ring-2 ring-text-main ring-offset-2 ring-offset-white"
                    : "opacity-80 hover:opacity-100"
                }`}
              />
            );
          })}
        </div>
        {color && (
          <p className="mt-1 text-xs text-text-sec">{swatch(color).label}</p>
        )}
      </Field>

      <Field label="Маршрут, кратко" error={fieldErr?.route_summary}>
        <textarea
          name="route_summary"
          defaultValue={initial?.route_summary}
          placeholder="Тиват → Будва → Котор → Бар"
          className="input min-h-[80px] resize-none"
          maxLength={400}
        />
      </Field>

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium shadow-float active:opacity-85 disabled:opacity-60"
      >
        {pending ? "Сохраняю…" : submitLabel}
      </button>

      <style jsx>{`
        .input {
          width: 100%;
          border: 1px solid rgba(0, 0, 0, 0.1);
          border-radius: 12px;
          padding: 12px 14px;
          font-size: 15px;
          background: white;
          color: #1d1d1f;
          outline: none;
          transition: border-color 120ms, box-shadow 120ms;
        }
        .input:focus {
          border-color: #3478f6;
          box-shadow: 0 0 0 3px rgba(52, 120, 246, 0.15);
        }
      `}</style>
    </form>
  );
}

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between mb-[6px]">
        <span className="text-[13px] font-medium text-text-main">{label}</span>
        {hint && !error && (
          <span className="text-[11px] text-text-mut">{hint}</span>
        )}
      </div>
      {children}
      {error && (
        <div className="text-[12px] text-accent mt-[6px]">{error}</div>
      )}
    </label>
  );
}
