/**
 * Auto-generate an `accommodation` expense row from a stay booking.
 *
 * Airbnb / Booking PDFs typically contain the *full* price ("Всего к
 * оплате") — we parse it into `stays.price` + `stays.currency`. The
 * user expects that number to show up in the budget screen, but the
 * Gemini classifier emits `type: 'stay'`, never `type: 'expense'`,
 * so no expense row is created by the regular commit pipeline.
 *
 * This helper fills that gap. It:
 *   • skips silently if the stay has no price / currency / check-in;
 *   • is idempotent — dedup by `document_id` OR, as a fallback, by
 *     (trip_id, category='accommodation', occurred_on, amount);
 *   • converts to the trip's base_currency via CBR;
 *   • attaches to day_id + destination_id so the row lands in the
 *     correct city bucket on the Budget screen.
 *
 * Called from `commit.ts` (fresh ingest) and from `rebuild.ts`
 * (back-fill for trips ingested before this helper existed).
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { convert } from "@/lib/rates/cbr";
import { resolveDestinationForDate } from "@/lib/trips/destinations";

type StayForExpense = {
  id: string;
  document_id: string | null;
  title: string | null;
  price: number | string | null;
  currency: string | null;
  check_in: string | null;
  destination_id: string | null;
};

export async function ensureAccommodationExpense(
  admin: SupabaseClient,
  tripId: string,
  baseCurrency: string,
  stay: StayForExpense,
  username: string | null
): Promise<{ created: boolean; skipped?: string; expenseId?: string }> {
  const price =
    typeof stay.price === "string" ? Number(stay.price) : stay.price;
  if (price == null || !Number.isFinite(price) || price <= 0) {
    return { created: false, skipped: "no-price" };
  }
  if (!stay.currency) return { created: false, skipped: "no-currency" };
  if (!stay.check_in) return { created: false, skipped: "no-check-in" };

  const occurredOn = stay.check_in.slice(0, 10);
  const title = stay.title?.trim() || "Проживание";

  // Idempotency pass #1: same document_id already has an expense.
  if (stay.document_id) {
    const { data: byDoc } = await admin
      .from("expenses")
      .select("id")
      .eq("trip_id", tripId)
      .eq("document_id", stay.document_id)
      .limit(1)
      .maybeSingle();
    if (byDoc) {
      return {
        created: false,
        skipped: "exists-by-doc",
        expenseId: (byDoc as { id: string }).id,
      };
    }
  }

  // Idempotency pass #2 (legacy rows without document_id link):
  // match by (category, date, amount, currency) which is unique
  // enough for accommodation — nobody pays the same exact amount at
  // the same check-in date twice on the same trip.
  {
    const { data: byShape } = await admin
      .from("expenses")
      .select("id")
      .eq("trip_id", tripId)
      .eq("category", "accommodation")
      .eq("occurred_on", occurredOn)
      .eq("amount_original", price)
      .eq("currency_original", stay.currency)
      .limit(1)
      .maybeSingle();
    if (byShape) {
      // Back-fill document_id so next pass uses the cheap path.
      if (stay.document_id) {
        await admin
          .from("expenses")
          .update({ document_id: stay.document_id })
          .eq("id", (byShape as { id: string }).id);
      }
      return {
        created: false,
        skipped: "exists-by-shape",
        expenseId: (byShape as { id: string }).id,
      };
    }
  }

  const conv = await convert(
    admin,
    price,
    stay.currency,
    baseCurrency,
    occurredOn
  );
  if (!conv) {
    return { created: false, skipped: "no-rate" };
  }

  // day_id + destination_id for the day the user checks in.
  const { data: day } = await admin
    .from("days")
    .select("id")
    .eq("trip_id", tripId)
    .eq("date", occurredOn)
    .limit(1)
    .maybeSingle();
  const dayId = (day as { id: string } | null)?.id ?? null;
  const destinationId =
    stay.destination_id ??
    (await resolveDestinationForDate(admin, tripId, occurredOn));

  const { data, error } = await admin
    .from("expenses")
    .insert({
      trip_id: tripId,
      day_id: dayId,
      destination_id: destinationId,
      document_id: stay.document_id,
      occurred_on: occurredOn,
      category: "accommodation",
      merchant: null,
      description: title,
      amount_original: price,
      currency_original: stay.currency,
      amount_base: conv.amount,
      currency_base: baseCurrency,
      rate_date: conv.rate_date,
      rate_used: conv.rate,
      source: "cowork",
      paid_by_username: username,
      created_by_username: username,
      split: "equal",
      items: [],
    })
    .select("id")
    .single();
  if (error || !data) {
    return { created: false, skipped: error?.message ?? "insert-failed" };
  }
  return { created: true, expenseId: (data as { id: string }).id };
}
