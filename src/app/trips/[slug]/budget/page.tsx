import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import BottomNav from "@/components/BottomNav";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CATEGORY_LABELS,
  PAYER_LABELS,
  formatMoney,
} from "@/lib/budget/labels";

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
  paid_by_username: string | null;
  split: string;
};

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
      "id,occurred_on,category,merchant,description,amount_original,currency_original,amount_base,currency_base,paid_by_username,split"
    )
    .eq("trip_id", trip.id)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });

  const expenses = (expData ?? []) as ExpenseRow[];

  // Totals in base currency
  let totalBase = 0;
  const byCategory = new Map<string, number>();
  let paidKirill = 0;
  let paidMarina = 0;
  let paidBoth = 0;
  let sharedBase = 0; // sum of equal-split amounts

  for (const e of expenses) {
    const amt = toNum(e.amount_base);
    totalBase += amt;
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + amt);
    if (e.paid_by_username === "kirill") paidKirill += amt;
    else if (e.paid_by_username === "marina") paidMarina += amt;
    else if (e.paid_by_username === "both") paidBoth += amt;
    if (e.split === "equal") sharedBase += amt;
  }

  // Balance: for each shared expense, each person owes half. If Kirill
  // paid it, Marina owes Kirill half. Payer "both" counts as already
  // split. The resulting balance is positive when Marina owes Kirill.
  let balanceMarinaOwesKirill = 0;
  for (const e of expenses) {
    if (e.split !== "equal") continue;
    const amt = toNum(e.amount_base);
    const half = amt / 2;
    if (e.paid_by_username === "kirill") balanceMarinaOwesKirill += half;
    else if (e.paid_by_username === "marina") balanceMarinaOwesKirill -= half;
    // "both" is 50/50 by construction, so no transfer needed.
  }

  const today = new Date().toISOString().slice(0, 10);
  const isPast = Boolean(trip.archived_at) || trip.date_to < today;

  // Group expenses by date for rendering
  const groups = new Map<string, ExpenseRow[]>();
  for (const e of expenses) {
    const arr = groups.get(e.occurred_on) ?? [];
    arr.push(e);
    groups.set(e.occurred_on, arr);
  }

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
                clockLabel: trip.country
                  ? trip.country.slice(0, 3).toUpperCase()
                  : "TZ",
                hideClock: false,
              }
            : null
        }
      />

      <div className="px-5 pb-28 pt-4 space-y-4">
        {/* Totals card */}
        <div className="bg-white rounded-card shadow-card p-5">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-2">
            Итого потрачено
          </div>
          <div className="font-mono text-[28px] font-bold text-text-main tnum">
            {formatMoney(totalBase, trip.base_currency)}
          </div>
          {expenses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-black/[0.06] grid grid-cols-3 gap-3 text-[12px] text-text-sec">
              <Pane
                label="Кирилл"
                value={formatMoney(paidKirill, trip.base_currency)}
              />
              <Pane
                label="Марина"
                value={formatMoney(paidMarina, trip.base_currency)}
              />
              <Pane
                label="Оба"
                value={formatMoney(paidBoth, trip.base_currency)}
              />
            </div>
          )}
        </div>

        {/* Balance card */}
        {expenses.length > 0 && sharedBase > 0 && (
          <div className="bg-white rounded-card shadow-card p-5">
            <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-1">
              Баланс
            </div>
            {Math.abs(balanceMarinaOwesKirill) < 0.01 ? (
              <div className="text-[15px] text-text-main">
                Всё ровно.
              </div>
            ) : balanceMarinaOwesKirill > 0 ? (
              <div className="text-[15px] text-text-main">
                Марина должна Кириллу{" "}
                <span className="font-mono font-bold tnum">
                  {formatMoney(balanceMarinaOwesKirill, trip.base_currency)}
                </span>
              </div>
            ) : (
              <div className="text-[15px] text-text-main">
                Кирилл должен Марине{" "}
                <span className="font-mono font-bold tnum">
                  {formatMoney(
                    Math.abs(balanceMarinaOwesKirill),
                    trip.base_currency
                  )}
                </span>
              </div>
            )}
            <div className="text-[12px] text-text-sec mt-1">
              По расходам, помеченным как «пополам».
            </div>
          </div>
        )}

        {/* Category breakdown */}
        {byCategory.size > 0 && (
          <div className="bg-white rounded-card shadow-card p-5">
            <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold mb-3">
              По категориям
            </div>
            <div className="space-y-2">
              {Array.from(byCategory.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([cat, sum]) => {
                  const pct = totalBase > 0 ? (sum / totalBase) * 100 : 0;
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
                          {formatMoney(sum, trip.base_currency)}
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
              (s, e) => s + toNum(e.amount_base),
              0
            );
            return (
              <section key={date}>
                <div className="flex items-center justify-between mb-2 px-1">
                  <h2 className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
                    {format(parseISO(date), "EEE, d MMMM", { locale: ru })}
                  </h2>
                  <span className="text-[12px] font-mono text-text-sec tnum">
                    {formatMoney(dayTotal, trip.base_currency)}
                  </span>
                </div>
                <div className="bg-white rounded-card shadow-card divide-y divide-black/[0.05]">
                  {rows.map((e) => (
                    <ExpenseRowView
                      key={e.id}
                      expense={e}
                      tripSlug={trip.slug}
                      baseCurrency={trip.base_currency}
                    />
                  ))}
                </div>
              </section>
            );
          })
        )}
      </div>

      <Link
        href={`/trips/${trip.slug}/budget/new`}
        className="fixed bottom-[max(72px,calc(env(safe-area-inset-bottom)+72px))] left-1/2 -translate-x-1/2 w-[calc(100%-40px)] max-w-[440px] bg-text-main text-white rounded-btn py-[14px] text-[15px] font-medium text-center shadow-float active:opacity-85"
      >
        + Расход
      </Link>

      <BottomNav slug={trip.slug} />
    </>
  );
}

function Pane({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.4px] font-semibold">
        {label}
      </div>
      <div className="font-mono tnum text-text-main text-[13px] mt-[2px]">
        {value}
      </div>
    </div>
  );
}

function ExpenseRowView({
  expense: e,
  tripSlug,
  baseCurrency,
}: {
  expense: ExpenseRow;
  tripSlug: string;
  baseCurrency: string;
}) {
  const cat = CATEGORY_LABELS[e.category] ?? { label: e.category, icon: "•" };
  const amtBase = toNum(e.amount_base);
  const amtOrig = toNum(e.amount_original);
  const showOriginal = e.currency_original !== baseCurrency;
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
        <div className="text-[14px] font-medium text-text-main truncate">
          {title}
        </div>
        <div className="text-[12px] text-text-sec truncate">
          {cat.label}
          {e.paid_by_username && (
            <>
              {" · "}
              {PAYER_LABELS[e.paid_by_username] ?? e.paid_by_username}
              {e.split === "equal" ? " · пополам" : ""}
            </>
          )}
          {subtitle ? ` · ${subtitle}` : ""}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <div className="font-mono text-[14px] font-semibold text-text-main tnum">
          {formatMoney(amtBase, baseCurrency)}
        </div>
        {showOriginal && (
          <div className="font-mono text-[11px] text-text-sec tnum">
            {formatMoney(amtOrig, e.currency_original)}
          </div>
        )}
      </div>
    </Link>
  );
}
