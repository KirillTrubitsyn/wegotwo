import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { prefetchRates, rateKey } from "@/lib/rates/cbr";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import BudgetBody, {
  type CurrencyView,
  type DestinationOpt,
  type DisplayCurrency,
  type ExpenseMeta,
} from "./BudgetBody";

export const revalidate = 30;

type Trip = {
  id: string;
  slug: string;
  title: string;
  base_currency: string;
  country: string | null;
  primary_tz: string;
  color: string;
  date_from: string;
  date_to: string;
  archived_at: string | null;
};

type ExpenseRow = {
  id: string;
  occurred_on: string;
  category: string;
  merchant: string | null;
  description: string | null;
  amount_original: number | string;
  currency_original: string;
  amount_base: number | string;
  currency_base: string;
  destination_id: string | null;
};

/**
 * Baseline trio shown in every trip. The fourth slot is the trip's
 * base_currency (country-of-stay currency, as declared on the trip).
 * Дедупим, если база уже в тройке — тогда показываем только три.
 */
const BASE_DISPLAY: DisplayCurrency[] = ["RUB", "EUR", "USD"];

function buildDisplayCurrencies(baseCurrency: string): DisplayCurrency[] {
  const norm = baseCurrency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(norm)) return [...BASE_DISPLAY];
  if (BASE_DISPLAY.includes(norm)) return [...BASE_DISPLAY];
  return [...BASE_DISPLAY, norm];
}

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) : v;
}

export default async function BudgetPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select(
      "id,slug,title,base_currency,country,primary_tz,color,date_from,date_to,archived_at"
    )
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  // Параллельно с основным запросом тянем сразу и header-контекст, и
  // справочник городов поездки (для бейджей и фильтра).
  const [{ data: expData }, stayCity, { data: destData }] = await Promise.all([
    admin
      .from("expenses")
      .select(
        "id,occurred_on,category,merchant,description,amount_original,currency_original,amount_base,currency_base,destination_id"
      )
      .eq("trip_id", trip.id)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    resolveHeaderDestination(admin, trip.id, trip.primary_tz),
    admin
      .from("destinations")
      .select("id,name,flag_code,sort_order,date_from")
      .eq("trip_id", trip.id)
      .eq("type", "stay")
      .order("sort_order", { ascending: true })
      .order("date_from", { ascending: true }),
  ]);

  const expenses = (expData ?? []) as ExpenseRow[];
  const destinations = ((destData ?? []) as Array<{
    id: string;
    name: string;
    flag_code: string | null;
    sort_order: number | null;
    date_from: string | null;
  }>).map<DestinationOpt>((d) => ({
    id: d.id,
    name: d.name,
    flagCode: d.flag_code,
  }));

  const DISPLAY_CURRENCIES = buildDisplayCurrencies(trip.base_currency);

  // Собираем все (date, from, to) тройки, которые нам нужны, чтобы
  // одним батч-запросом в exchange_rates получить все курсы разом.
  // Раньше тут был цикл await convert(...) внутри цикла — до 120
  // последовательных round-trip'ов. Теперь один batch + параллельные
  // fetch'и ЦБ для промахов кэша.
  const triples: { date: string; from: string; to: string }[] = [];
  for (const e of expenses) {
    const from = e.currency_original;
    const date = e.occurred_on;
    for (const target of DISPLAY_CURRENCIES) {
      if (from === target) continue;
      if (e.currency_base === target) continue;
      triples.push({ date, from, to: target });
    }
  }
  const rates = await prefetchRates(admin, triples);

  const views: Record<DisplayCurrency, CurrencyView> = {};
  for (const c of DISPLAY_CURRENCIES) {
    views[c] = { total: 0, byCategory: {}, amounts: {} };
  }
  let missingRates = false;

  for (const e of expenses) {
    const from = e.currency_original;
    const amtOrig = toNum(e.amount_original);
    const amtBase = toNum(e.amount_base);
    const date = e.occurred_on;

    for (const target of DISPLAY_CURRENCIES) {
      let amt: number;
      if (from === target) {
        amt = amtOrig;
      } else if (e.currency_base === target) {
        amt = amtBase;
      } else {
        const r = rates.get(rateKey(date, from, target));
        if (r) {
          amt = Math.round(amtOrig * r.rate * 100) / 100;
        } else {
          missingRates = true;
          amt = 0;
        }
      }
      const v = views[target];
      v.amounts[e.id] = amt;
      v.total += amt;
      v.byCategory[e.category] = (v.byCategory[e.category] ?? 0) + amt;
    }
  }

  // Round totals / category sums to 2 decimals so display is clean.
  for (const tgt of DISPLAY_CURRENCIES) {
    const v = views[tgt];
    v.total = Math.round(v.total * 100) / 100;
    for (const k of Object.keys(v.byCategory)) {
      v.byCategory[k] = Math.round(v.byCategory[k] * 100) / 100;
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  const expensesMeta: ExpenseMeta[] = expenses.map((e) => ({
    id: e.id,
    occurred_on: e.occurred_on,
    category: e.category,
    merchant: e.merchant,
    description: e.description,
    amount_original: toNum(e.amount_original),
    currency_original: e.currency_original,
    destination_id: e.destination_id,
  }));

  // Пользователь обычно смотрит расходы в валюте страны пребывания —
  // это дефолт. Если base_currency почему-то невалидна, падаем на RUB.
  const normalizedBase = trip.base_currency.trim().toUpperCase();
  const defaultCurrency: DisplayCurrency = DISPLAY_CURRENCIES.includes(
    normalizedBase
  )
    ? normalizedBase
    : DISPLAY_CURRENCIES[0];

  return (
    <>
      <OfflineBanner />
      <Header
        title="Бюджет"
        subtitle={trip.title}
        back={`/trips/${trip.slug}`}
        trip={
          !isPast
            ? {
                primaryTz: trip.primary_tz,
                color: trip.color,
                clockLabel: stayCity?.label ?? (
                  trip.country
                    ? trip.country.slice(0, 3).toUpperCase()
                    : "TZ"
                ),
                lat: stayCity?.lat ?? null,
                lon: stayCity?.lon ?? null,
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-4">
        <BudgetBody
          slug={trip.slug}
          expenses={expensesMeta}
          views={views}
          displayCurrencies={DISPLAY_CURRENCIES}
          defaultCurrency={defaultCurrency}
          missingRates={missingRates}
          destinations={destinations}
        />
      </div>

      <div className="fixed bottom-[max(72px,calc(env(safe-area-inset-bottom)+72px))] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[440px] flex gap-2">
        <Link
          href={`/trips/${trip.slug}/budget/scan`}
          className="flex-1 bg-white border border-black/[0.08] text-text-main rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:bg-bg-surface"
        >
          📸 Скан
        </Link>
        <Link
          href={`/trips/${trip.slug}/budget/new`}
          className="flex-1 bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:opacity-85"
        >
          + Расход
        </Link>
      </div>

      <BottomNav slug={trip.slug} active="budget" />
    </>
  );
}
