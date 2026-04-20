"use client";

/**
 * Client body of the budget page. Holds the currency-picker state,
 * shows totals and a by-category breakdown, and renders the day-grouped
 * expense list. The server precomputes amounts in every display
 * currency so the client can switch instantly without a roundtrip.
 */
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import { CATEGORY_LABELS, formatMoney } from "@/lib/budget/labels";

/**
 * ISO-4217 code. The fourth slot is the trip's base currency (EUR for
 * Montenegro, CHF for Switzerland, RSD for Serbia, JPY for Japan…).
 * Baseline trio is always RUB/EUR/USD; base_currency is appended and
 * deduped on the server.
 */
export type DisplayCurrency = string;

export type CurrencyView = {
  total: number;
  byCategory: Record<string, number>;
  amounts: Record<string, number>; // expense.id → amount in this currency
};

export type ExpenseMeta = {
  id: string;
  occurred_on: string;
  category: string;
  merchant: string | null;
  description: string | null;
  amount_original: number;
  currency_original: string;
  destination_id: string | null;
};

export type DestinationOpt = {
  id: string;
  name: string;
  flagCode: string | null;
};

type DestFilter = "all" | "none" | string;

function Flag({ code }: { code: string | null }) {
  if (!code) return null;
  const cc = code.toLowerCase();
  return (
    <span
      className="inline-block w-[14px] h-[10px] bg-contain bg-no-repeat bg-center rounded-[1px] align-[-1px]"
      style={{ backgroundImage: `url(https://flagcdn.com/w40/${cc}.png)` }}
    />
  );
}

function CityChip({ dest }: { dest: DestinationOpt }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[6px] bg-blue-lt text-blue text-[10px] font-semibold px-[6px] py-[2px] tracking-[0.2px]">
      <Flag code={dest.flagCode} />
      <span className="uppercase">{dest.name}</span>
    </span>
  );
}

export default function BudgetBody({
  slug,
  expenses,
  views,
  displayCurrencies,
  defaultCurrency,
  missingRates,
  destinations,
}: {
  slug: string;
  expenses: ExpenseMeta[];
  views: Record<DisplayCurrency, CurrencyView>;
  displayCurrencies: DisplayCurrency[];
  defaultCurrency: DisplayCurrency;
  missingRates: boolean;
  destinations: DestinationOpt[];
}) {
  const [cur, setCur] = useState<DisplayCurrency>(defaultCurrency);
  const [destFilter, setDestFilter] = useState<DestFilter>("all");

  const destMap = useMemo(
    () => new Map(destinations.map((d) => [d.id, d])),
    [destinations]
  );

  // Список городов, которые реально содержат траты — скрываем
  // таб «Без города», если все траты привязаны.
  const hasUnassigned = useMemo(
    () => expenses.some((e) => e.destination_id == null),
    [expenses]
  );

  const visibleExpenses = useMemo(() => {
    if (destFilter === "all") return expenses;
    if (destFilter === "none")
      return expenses.filter((e) => e.destination_id == null);
    return expenses.filter((e) => e.destination_id === destFilter);
  }, [expenses, destFilter]);

  const view = useMemo<CurrencyView>(() => {
    const base = views[cur];
    if (destFilter === "all") return base;
    // Пересчёт total и byCategory по видимому срезу. amounts
    // остаются общими, потому что ключ — expense.id.
    let total = 0;
    const byCategory: Record<string, number> = {};
    for (const e of visibleExpenses) {
      const amt = base.amounts[e.id] ?? 0;
      total += amt;
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
    }
    return {
      total: Math.round(total * 100) / 100,
      byCategory: Object.fromEntries(
        Object.entries(byCategory).map(([k, v]) => [
          k,
          Math.round(v * 100) / 100,
        ])
      ),
      amounts: base.amounts,
    };
  }, [views, cur, destFilter, visibleExpenses]);

  const groups = useMemo(() => {
    const m = new Map<string, ExpenseMeta[]>();
    for (const e of visibleExpenses) {
      const arr = m.get(e.occurred_on) ?? [];
      arr.push(e);
      m.set(e.occurred_on, arr);
    }
    return m;
  }, [visibleExpenses]);

  const categoryEntries = Object.entries(view.byCategory).sort(
    (a, b) => b[1] - a[1]
  );

  return (
    <>
      {/* Totals card */}
      <div className="bg-white rounded-card shadow-card p-5">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
            Итого потрачено
          </div>
          <CurrencyPicker
            value={cur}
            onChange={setCur}
            options={displayCurrencies}
          />
        </div>
        <div className="font-mono text-[28px] font-bold text-text-main tnum">
          {formatMoney(view.total, cur)}
        </div>
        {missingRates && (
          <div className="text-[11px] text-text-sec mt-2">
            Некоторые суммы показаны в исходной валюте — курс ЦБ РФ на нужную дату не найден.
          </div>
        )}
      </div>

      {/* Destination filter */}
      {destinations.length > 1 && (
        <div className="flex gap-[6px] overflow-x-auto no-scrollbar -mx-5 px-5 pb-1">
          <DestButton
            active={destFilter === "all"}
            onClick={() => setDestFilter("all")}
          >
            Все
          </DestButton>
          {destinations.map((d) => (
            <DestButton
              key={d.id}
              active={destFilter === d.id}
              onClick={() => setDestFilter(d.id)}
            >
              <Flag code={d.flagCode} />
              <span>{d.name}</span>
            </DestButton>
          ))}
          {hasUnassigned && (
            <DestButton
              active={destFilter === "none"}
              onClick={() => setDestFilter("none")}
            >
              Без города
            </DestButton>
          )}
        </div>
      )}

      {/* Category breakdown */}
      {categoryEntries.length > 0 && (
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-3">
            По категориям
          </div>
          <div className="space-y-2">
            {categoryEntries.map(([cat, sum]) => {
              const pct = view.total > 0 ? (sum / view.total) * 100 : 0;
              const label = CATEGORY_LABELS[cat] ?? {
                label: cat,
                icon: "•",
              };
              return (
                <div key={cat}>
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="text-text-main">
                      {label.icon} {label.label}
                    </span>
                    <span className="font-mono text-text-sec tnum">
                      {formatMoney(sum, cur)}
                    </span>
                  </div>
                  <div className="h-[3px] bg-bg-surface rounded-full mt-1 overflow-hidden">
                    <div
                      className="h-full bg-blue"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Expenses list by day */}
      {expenses.length === 0 ? (
        <div className="rounded-card bg-white shadow-card p-6 text-center">
          <p className="text-text-main font-medium text-[15px]">
            Расходов пока нет
          </p>
          <p className="text-text-sec text-[13px] mt-1">
            Добавьте первый расход кнопкой ниже.
          </p>
        </div>
      ) : (
        Array.from(groups.entries()).map(([date, rows]) => {
          const dayTotal = rows.reduce(
            (s, e) => s + (view.amounts[e.id] ?? 0),
            0
          );
          return (
            <section key={date}>
              <div className="flex items-center justify-between mb-2 px-1">
                <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
                  {format(parseISO(date), "EEE, d MMMM", { locale: ru })}
                </h2>
                <span className="text-[12px] font-mono text-text-sec tnum">
                  {formatMoney(dayTotal, cur)}
                </span>
              </div>
              <div className="bg-white rounded-card shadow-card divide-y divide-black/[0.05]">
                {rows.map((e) => (
                  <ExpenseRowView
                    key={e.id}
                    expense={e}
                    tripSlug={slug}
                    amount={view.amounts[e.id] ?? 0}
                    displayCurrency={cur}
                    destination={
                      e.destination_id
                        ? destMap.get(e.destination_id) ?? null
                        : null
                    }
                  />
                ))}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}

function CurrencyPicker({
  value,
  onChange,
  options,
}: {
  value: DisplayCurrency;
  onChange: (c: DisplayCurrency) => void;
  options: DisplayCurrency[];
}) {
  return (
    <div className="inline-flex rounded-[10px] bg-bg-surface p-[2px] text-[11px] font-semibold">
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`px-[9px] py-[4px] rounded-[8px] transition-colors ${
            value === opt
              ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)] text-text-main"
              : "text-text-sec"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ExpenseRowView({
  expense: e,
  tripSlug,
  amount,
  displayCurrency,
  destination,
}: {
  expense: ExpenseMeta;
  tripSlug: string;
  amount: number;
  displayCurrency: DisplayCurrency;
  destination: DestinationOpt | null;
}) {
  const cat = CATEGORY_LABELS[e.category] ?? { label: e.category, icon: "•" };
  const showOriginal = e.currency_original !== displayCurrency;
  const title = e.merchant || e.description || cat.label;
  const subtitle = e.merchant && e.description ? e.description : null;

  return (
    <Link
      href={`/trips/${tripSlug}/budget/${e.id}`}
      className="flex items-center gap-3 px-4 py-3 active:bg-bg-surface"
    >
      <div className="w-8 h-8 rounded-full bg-bg-surface flex items-center justify-center text-[14px] flex-shrink-0">
        {cat.icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-[6px] min-w-0">
          <span className="text-[14px] font-medium text-text-main truncate">
            {title}
          </span>
          {destination && <CityChip dest={destination} />}
        </div>
        <div className="text-[12px] text-text-sec truncate">
          {cat.label}
          {subtitle ? ` · ${subtitle}` : ""}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-mono text-[14px] font-semibold text-text-main tnum">
          {formatMoney(amount, displayCurrency)}
        </div>
        {showOriginal && (
          <div className="font-mono text-[11px] text-text-sec tnum">
            {formatMoney(e.amount_original, e.currency_original)}
          </div>
        )}
      </div>
    </Link>
  );
}

function DestButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 inline-flex items-center gap-[6px] rounded-[10px] px-[12px] py-[7px] text-[12px] font-semibold transition-colors whitespace-nowrap ${
        active
          ? "bg-text-main text-white"
          : "bg-white text-text-main border border-black/[0.08]"
      }`}
    >
      {children}
    </button>
  );
}
