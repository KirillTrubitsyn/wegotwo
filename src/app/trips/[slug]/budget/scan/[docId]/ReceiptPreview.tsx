"use client";

/**
 * Редактор распознанного чека.
 *
 * Показывает превью изображения + форму с полями, которые Gemini
 * извлёк (дата, категория, сумма, валюта, merchant, description).
 * Пользователь правит при необходимости и сохраняет. При сохранении
 * серверная action переписывает parsed_fields и вызывает
 * commitParsedDocument — после этого строка появляется в /budget.
 *
 * Если Gemini классифицировал документ не как expense — предупреждаем,
 * но не блокируем: пользователь всё равно может сохранить как расход,
 * отредактировав поля.
 */

import { useActionState, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CATEGORY_LABELS, CURRENCY_SYMBOLS } from "@/lib/budget/labels";
import type { ScanCommitState } from "../actions";

type Defaults = {
  occurred_on: string;
  category: string;
  merchant: string;
  description: string;
  amount_original: string;
  currency_original: string;
};

type ItemDraft = {
  description: string;
  amount: string;
  share: "k" | "common" | "m";
};

type Props = {
  commitAction: (
    prev: ScanCommitState,
    fd: FormData
  ) => Promise<ScanCommitState>;
  discardAction: () => Promise<void>;
  slug: string;
  docId: string;
  previewUrl: string | null;
  parsedSummary: string | null;
  parsedConfidence: number | null;
  parsedType: "flight" | "stay" | "expense" | "unknown" | null | undefined;
  parsedError: string | null;
  defaults: Defaults;
  baseCurrency: string;
  initialItems: { description: string | null; amount: number | null }[];
};

const CATEGORIES = [
  "restaurant",
  "groceries",
  "transport",
  "tours",
  "activities",
  "tickets",
  "shopping",
  "telecom",
  "accommodation",
  "flight",
  "fees",
  "other",
];

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

function buildCurrencyList(base: string, current: string): string[] {
  const list = [current, base, ...FALLBACK_CURRENCIES]
    .map((c) => c.trim().toUpperCase())
    .filter((c) => /^[A-Z]{3}$/.test(c));
  return Array.from(new Set(list));
}

const INITIAL: ScanCommitState = { ok: true };

export default function ReceiptPreview({
  commitAction,
  discardAction,
  slug,
  previewUrl,
  parsedSummary,
  parsedConfidence,
  parsedType,
  parsedError,
  defaults,
  baseCurrency,
  initialItems,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(commitAction, INITIAL);
  const fields = !state.ok ? state.fields ?? {} : {};
  const formErr = !state.ok ? state.form : undefined;

  const currencyOptions = buildCurrencyList(
    baseCurrency,
    defaults.currency_original
  );

  const showTypeWarning =
    parsedType && parsedType !== "expense" && parsedType !== "unknown";

  const [items, setItems] = useState<ItemDraft[]>(() =>
    initialItems.length > 0
      ? initialItems.map((it) => ({
          description: it.description ?? "",
          amount:
            it.amount != null
              ? String(it.amount).replace(".", ",")
              : "",
          share: "common",
        }))
      : []
  );
  const [currency, setCurrency] = useState(defaults.currency_original);

  const splitTotals = useMemo(() => {
    let k = 0;
    let m = 0;
    let c = 0;
    for (const it of items) {
      const n = Number(it.amount.replace(",", "."));
      if (!Number.isFinite(n)) continue;
      if (it.share === "k") k += n;
      else if (it.share === "m") m += n;
      else c += n;
    }
    return {
      kirill: round2(k + c / 2),
      marina: round2(m + c / 2),
      common: round2(c),
      total: round2(k + m + c),
    };
  }, [items]);

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };
  const addItem = () =>
    setItems((prev) => [...prev, { description: "", amount: "", share: "common" }]);
  const removeItem = (idx: number) =>
    setItems((prev) => prev.filter((_, i) => i !== idx));
  const bulkAssign = (share: "k" | "common" | "m") =>
    setItems((prev) => prev.map((it) => ({ ...it, share })));

  return (
    <div className="space-y-4">
      {previewUrl ? (
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt="Снимок чека"
            className="w-full max-h-[360px] object-contain bg-black/5"
          />
        </div>
      ) : null}

      <section className="bg-white rounded-card shadow-card p-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
            ИИ-разбор
          </div>
          <div className="text-[11px] text-text-sec">
            {parsedConfidence != null
              ? `уверенность ${Math.round(parsedConfidence * 100)} %`
              : null}
          </div>
        </div>
        {parsedSummary ? (
          <div className="text-[14px] text-text-main">{parsedSummary}</div>
        ) : (
          <div className="text-[13px] text-text-sec">
            Модель не распознала поля автоматически. Заполните вручную.
          </div>
        )}
        {parsedError ? (
          <div className="text-[12px] text-accent bg-red-lt rounded-btn p-2">
            {parsedError}
          </div>
        ) : null}
        {showTypeWarning ? (
          <div className="text-[12px] text-text-main bg-gold-lt border border-gold/30 rounded-btn p-2">
            Документ похож на «{labelForType(parsedType)}», а не на чек. Всё
            равно можно сохранить как расход, если это то, что нужно.
          </div>
        ) : null}
      </section>

      <form action={formAction} className="bg-white rounded-card shadow-card p-5 space-y-4">
        {formErr ? (
          <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
            {formErr}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="Дата" error={fields.occurred_on}>
            <input
              name="occurred_on"
              type="date"
              defaultValue={defaults.occurred_on}
              required
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
            />
          </Field>
          <Field label="Категория" error={fields.category}>
            <select
              name="category"
              defaultValue={defaults.category}
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
              defaultValue={defaults.amount_original}
              required
              placeholder="0,00"
              className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
            />
          </Field>
          <Field label="Валюта" error={fields.currency_original}>
            <select
              name="currency_original"
              value={currency}
              onChange={(ev) => setCurrency(ev.target.value)}
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

        <Field label="Где">
          <input
            name="merchant"
            defaultValue={defaults.merchant}
            maxLength={160}
            placeholder="Konoba Catovica Mlini"
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
          />
        </Field>

        <Field label="Описание">
          <textarea
            name="description"
            defaultValue={defaults.description}
            maxLength={400}
            rows={2}
            placeholder="Ужин"
            className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none resize-y"
          />
        </Field>

        <div className="border-t border-black/5 pt-4 space-y-3">
          <div className="flex items-baseline justify-between">
            <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
              Позиции чека
            </div>
            <div className="text-[11px] text-text-sec">
              {items.length > 0 ? `${items.length} шт.` : "ИИ не распознал"}
            </div>
          </div>

          {items.length > 0 ? (
            <>
              <div className="flex gap-2 text-[12px]">
                <button
                  type="button"
                  onClick={() => bulkAssign("common")}
                  className="flex-1 bg-bg-surface rounded-btn py-[8px] font-medium text-text-main active:opacity-85"
                >
                  Всё общее
                </button>
                <button
                  type="button"
                  onClick={() => bulkAssign("k")}
                  className="flex-1 bg-bg-surface rounded-btn py-[8px] font-medium text-text-main active:opacity-85"
                >
                  Всё К
                </button>
                <button
                  type="button"
                  onClick={() => bulkAssign("m")}
                  className="flex-1 bg-bg-surface rounded-btn py-[8px] font-medium text-text-main active:opacity-85"
                >
                  Всё М
                </button>
              </div>

              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div
                    key={idx}
                    className="bg-bg-surface rounded-btn p-2 space-y-2"
                  >
                    <div className="grid grid-cols-[1fr_84px_28px] gap-2">
                      <input
                        name="items_description"
                        value={it.description}
                        onChange={(ev) =>
                          updateItem(idx, { description: ev.target.value })
                        }
                        placeholder="Позиция"
                        className="bg-white rounded-btn px-2 py-[8px] text-[13px] text-text-main border border-transparent focus:border-blue focus:outline-none"
                      />
                      <input
                        name="items_amount"
                        value={it.amount}
                        onChange={(ev) =>
                          updateItem(idx, { amount: ev.target.value })
                        }
                        inputMode="decimal"
                        placeholder="0,00"
                        className="bg-white rounded-btn px-2 py-[8px] text-[13px] text-text-main border border-transparent focus:border-blue focus:outline-none tnum text-right"
                      />
                      <button
                        type="button"
                        aria-label="Удалить позицию"
                        onClick={() => removeItem(idx)}
                        className="text-text-sec active:opacity-60 text-[16px]"
                      >
                        ×
                      </button>
                    </div>
                    <div className="flex gap-1">
                      <ShareChip
                        active={it.share === "k"}
                        onClick={() => updateItem(idx, { share: "k" })}
                        label="К"
                      />
                      <ShareChip
                        active={it.share === "common"}
                        onClick={() => updateItem(idx, { share: "common" })}
                        label="Общее"
                      />
                      <ShareChip
                        active={it.share === "m"}
                        onClick={() => updateItem(idx, { share: "m" })}
                        label="М"
                      />
                      <input
                        type="hidden"
                        name="items_share"
                        value={it.share}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="bg-blue-lt rounded-btn p-3 grid grid-cols-3 gap-2 text-center">
                <SplitTotal label="Кирилл" value={splitTotals.kirill} currency={currency} />
                <SplitTotal label="Общее" value={splitTotals.common} currency={currency} />
                <SplitTotal label="Марина" value={splitTotals.marina} currency={currency} />
              </div>
            </>
          ) : (
            <div className="text-[12px] text-text-sec">
              Позиции не распознаны. Можно добавить вручную, если нужно разделить по плательщикам.
            </div>
          )}

          <button
            type="button"
            onClick={addItem}
            className="w-full bg-bg-surface rounded-btn py-[10px] text-[13px] font-medium text-text-main active:opacity-85"
          >
            + Добавить позицию
          </button>
        </div>

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={() => router.push(`/trips/${slug}/budget`)}
            className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
          >
            Отмена
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 bg-text-main text-white rounded-btn py-[12px] text-[14px] font-semibold active:opacity-85 disabled:opacity-50"
          >
            {pending ? "Сохраняем…" : "Сохранить расход"}
          </button>
        </div>
      </form>

      <form action={discardAction}>
        <button
          type="submit"
          className="w-full text-[13px] text-accent underline-offset-2 hover:underline"
        >
          Удалить этот скан
        </button>
      </form>
    </div>
  );
}

function labelForType(t?: string | null): string {
  switch (t) {
    case "flight":
      return "Рейс";
    case "stay":
      return "Проживание";
    case "unknown":
      return "Не распознано";
    default:
      return "Документ";
  }
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
      {error ? <div className="text-[12px] text-accent mt-1">{error}</div> : null}
    </div>
  );
}

function ShareChip({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex-1 rounded-btn py-[6px] text-[12px] font-semibold transition-colors " +
        (active
          ? "bg-text-main text-white"
          : "bg-white text-text-sec border border-black/5")
      }
    >
      {label}
    </button>
  );
}

function SplitTotal({
  label,
  value,
  currency,
}: {
  label: string;
  value: number;
  currency: string;
}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.5px] text-text-sec font-semibold">
        {label}
      </div>
      <div className="text-[14px] font-semibold text-text-main tnum">
        {value.toLocaleString("ru-RU", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}{" "}
        <span className="text-[11px] text-text-sec">{currency}</span>
      </div>
    </div>
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
