/**
 * Historical exchange rates via CBR RF with a local cache in the
 * `exchange_rates` table.
 *
 * Source: https://www.cbr-xml-daily.ru/archive/YYYY/MM/DD/daily_json.js
 * Returns rates relative to RUB. The CBR data is published on business
 * days only, so we walk back up to 7 calendar days to find the closest
 * rate (the same approach bookkeepers use for weekends and holidays).
 *
 * All conversions go through RUB so we do not have to fetch every
 * base/quote pair. Rate semantics:
 *   amount_in_quote = amount_in_base * rate(base -> quote)
 *   rate(base -> quote) = rate(RUB -> quote) / rate(RUB -> base)
 *                       = price_in_rub(base) / price_in_rub(quote)
 *
 * The CBR response gives price_in_rub per 1 unit of foreign currency
 * via Value / Nominal. RUB itself is implicit at 1.0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

const CBR_SOURCE = "cbr";

type CbrEntry = { CharCode: string; Value: number; Nominal: number };
type CbrResponse = {
  Date: string;
  Timestamp: string;
  PreviousURL: string;
  PreviousDate: string;
  Valute: Record<string, CbrEntry>;
};

async function fetchCbrDay(dateISO: string): Promise<CbrResponse | null> {
  const [y, m, d] = dateISO.split("-");
  const url = `https://www.cbr-xml-daily.ru/archive/${y}/${m}/${d}/daily_json.js`;
  try {
    const resp = await fetch(url, {
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as CbrResponse;
  } catch {
    return null;
  }
}

function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function priceInRub(resp: CbrResponse, currency: string): number | null {
  if (currency === "RUB") return 1;
  const e = resp.Valute[currency];
  if (!e || !e.Value || !e.Nominal) return null;
  return e.Value / e.Nominal;
}

async function readCache(
  admin: SupabaseClient,
  rateDate: string,
  base: string,
  quote: string
): Promise<number | null> {
  const { data } = await admin
    .from("exchange_rates")
    .select("rate")
    .eq("rate_date", rateDate)
    .eq("base", base)
    .eq("quote", quote)
    .maybeSingle();
  const row = data as { rate: number | string } | null;
  if (!row) return null;
  return typeof row.rate === "string" ? Number(row.rate) : row.rate;
}

async function writeCache(
  admin: SupabaseClient,
  rateDate: string,
  base: string,
  quote: string,
  rate: number
): Promise<void> {
  await admin
    .from("exchange_rates")
    .upsert(
      {
        rate_date: rateDate,
        base,
        quote,
        rate,
        source: CBR_SOURCE,
      },
      { onConflict: "rate_date,base,quote" }
    );
}

/**
 * Get the rate from `base` to `quote` on a given date, using cache
 * first and CBR as source of truth.
 *
 * Returns null if no rate can be resolved (unknown currency or no
 * CBR data within 7 days).
 */
export async function getRate(
  admin: SupabaseClient,
  rateDate: string,
  base: string,
  quote: string
): Promise<{ rate: number; rate_date: string } | null> {
  if (base === quote) return { rate: 1, rate_date: rateDate };

  // Cache lookup first
  const cached = await readCache(admin, rateDate, base, quote);
  if (cached != null && Number.isFinite(cached)) {
    return { rate: cached, rate_date: rateDate };
  }

  // CBR publishes on business days; fall back up to 7 days.
  for (let i = 0; i <= 7; i++) {
    const probe = addDays(rateDate, -i);
    const resp = await fetchCbrDay(probe);
    if (!resp) continue;

    const baseRub = priceInRub(resp, base);
    const quoteRub = priceInRub(resp, quote);
    if (baseRub == null || quoteRub == null) return null;

    const rate = baseRub / quoteRub;
    await writeCache(admin, rateDate, base, quote, rate);
    return { rate, rate_date: probe };
  }

  return null;
}

/**
 * Convert amount from one currency to another on a given date.
 * Returns { amount_base, rate_used, rate_date } or null if unresolved.
 */
export async function convert(
  admin: SupabaseClient,
  amount: number,
  from: string,
  to: string,
  onDateISO: string
): Promise<{ amount: number; rate: number; rate_date: string } | null> {
  const r = await getRate(admin, onDateISO, from, to);
  if (!r) return null;
  return {
    amount: Math.round(amount * r.rate * 100) / 100,
    rate: r.rate,
    rate_date: r.rate_date,
  };
}
