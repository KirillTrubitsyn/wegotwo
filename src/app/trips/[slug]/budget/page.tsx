import Link from "next/link";
import { notFound } from "next/navigation";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import { convert } from "@/lib/rates/cbr";
import { resolveHeaderDestination } from "@/lib/trips/header-ctx";
import BudgetBody, {
  type CurrencyView,
  type DisplayCurrency,
  type ExpenseMeta,
} from "./BudgetBody";

export const dynamic = "force-dynamic";

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

  const { data: expData } = await admin
    .from("expenses")
    .select(
      "id,occurred_on,category,merchant,description,amount_original,currency_original,amount_base,currency_base"
    )
    .eq("trip_id", trip.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  const expenses = (expData ?? []) as ExpenseRow[];

  const DISPLAY_CURRENCIES = buildDisplayCurrencies(trip.base_currency);

  // Precompute per-display-currency amounts for every expense, reusing
  // the CBR cache. We start from `amount_original` / `currency_original`
  // on `occurred_on` so we pick up fresh rates rather than cascading
  // through the trip's base currency.
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
        const conv = await convert(admin, amtOrig, from, target, date);
        if (conv) {
          amt = conv.amount;
        } else {
          missingRates = true;
          amt = 0; // skip contribution; row will fall back to original
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
  const stayCity = await resolveHeaderDestination(admin, trip.id);

  const expensesMeta: ExpenseMeta[] = expenses.map((e) => ({
    id: e.id,
    occurred_on: e.occurred_on,
    category: e.category,
    merchant: e.merchant,
    description: e.description,
    amount_original: toNum(e.amount_original),
    currency_original: e.currency_original,
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

      <BottomNav slug={trip.slug} />
    </>
  );
}
