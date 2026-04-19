"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { ExpenseActionState } from "./actions";
import {
  CATEGORY_LABELS,
  CURRENCY_SYMBOLS,
  PAYER_LABELS,
  SPLIT_LABELS,
} from "@/lib/budget/labels";

const FALLBACK_CURRENCIES = [
  "RUB",
  "EUR",
  "USD",
  "CHF",
  "GBP",
  "RSD",
  "TRY",
  "GEL",
];

// Ставим валюту страны поездки первой в списке — обычно чеки и
// документы приходят именно в ней. Дополнительно подмешиваем
// стандартный набор, чтобы можно было ввести сумму в RUB/USD/…
function buildCurrencyList(base: string): string[] {
  const norm = base.trim().toUpperCase();
  const list = /^[A-Z]{3}$/.test(norm)
    ? [norm, ...FALLBACK_CURRENCIES]
    : [...FALLBACK_CURRENCIES];
  return Array.from(new Set(list));
}
const CATEGORIES = [
  "flight",
  "transport",
  "accommodation",
  "restaurant",
  "groceries",
  "tours",
  "activities",
  "tickets",
  "shopping",
  "telecom",
  "fees",
  "other",
];
const PAYERS = ["kirill", "marina", "both"];
const SPLITS = ["equal", "payer"];

type Props = {
  tripSlug: string;
  action: (
    prev: ExpenseActionState,
    fd: FormData
  ) => Promise<ExpenseActionState>;
  initial?: {
    occurred_on?: string;
    category?: string;
    merchant?: string | null;
    description?: string | null;
    amount_original?: string;
    currency_original?: string;
    paid_by_username?: string | null;
    split?: string;
  };
  defaultDate: string;
  defaultCurrency: string;
  submitLabel: string;
};

const empty: ExpenseActionState = { ok: true };

export default function ExpenseForm({
  tripSlug,
  action,
  initial,
  defaultDate,
  defaultCurrency,
  submitLabel,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, empty);

  const fields = !state.ok ? state.fields ?? {} : {};
  const formErr = !state.ok ? state.form : undefined;

  const currencyOptions = buildCurrencyList(defaultCurrency);

  return (
    <form action={formAction} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Дата" error={fields.occurred_on}>
          <input
            name="occurred_on"
            type="date"
            defaultValue={initial?.occurred_on ?? defaultDate}
            required
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
          />
        </Field>
        <Field label="Категория" error={fields.category}>
          <select
            name="category"
            defaultValue={initial?.category ?? "other"}
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABELS[c]?.icon} {CATEGORY_LABELS[c]?.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Сумма" error={fields.amount_original}>
          <input
            name="amount_original"
            inputMode="decimal"
            defaultValue={initial?.amount_original ?? ""}
            required
            placeholder="0,00"
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
          />
        </Field>
        <Field label="Валюта" error={fields.currency_original}>
          <select
            name="currency_original"
            defaultValue={initial?.currency_original ?? defaultCurrency}
            className="bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
          >
            {currencyOptions.map((c) => (
              <option key={c} value={c}>
                {c} {CURRENCY_SYMBOLS[c] ?? ""}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Место или продавец" error={fields.merchant}>
        <input
          name="merchant"
          defaultValue={initial?.merchant ?? ""}
          maxLength={120}
          placeholder="Konoba Catovica Mlini"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </Field>

      <Field label="Описание" error={fields.description}>
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          maxLength={400}
          rows={2}
          placeholder="Ужин"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none resize-y"
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Кто платил" error={fields.paid_by_username}>
          <select
            name="paid_by_username"
            defaultValue={initial?.paid_by_username ?? "kirill"}
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
          >
            {PAYERS.map((p) => (
              <option key={p} value={p}>
                {PAYER_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Как делим" error={fields.split}>
          <select
            name="split"
            defaultValue={initial?.split ?? "equal"}
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
          >
            {SPLITS.map((s) => (
              <option key={s} value={s}>
                {SPLIT_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(`/trips/${tripSlug}/budget`)}
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
      {error && <div className="text-[12px] text-accent mt-1">{error}</div>}
    </div>
  );
}
