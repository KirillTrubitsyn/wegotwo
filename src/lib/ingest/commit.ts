/**
 * Commit a parsed document into the corresponding table.
 *
 * Reads `documents.parsed_fields` (already validated against the
 * Zod schema and stored by the analyze step), writes a single new
 * row in `flights`, `stays`, or `expenses`, and updates the parent
 * document row to `parsed_status = 'parsed'`.
 *
 * Idempotency: if the document already has an entry linked via
 * `document_id`, we do nothing and return that row's id. The caller
 * surfaces this as a no-op success.
 *
 * All rows are created with `source` = 'cowork' so they can be
 * distinguished from manual entries in reports.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { convert } from "@/lib/rates/cbr";
import {
  ParsedDocument,
  type ParsedDocument as ParsedDocumentT,
  type FlightFields,
  type StayFields,
  type ExpenseFields,
} from "@/lib/gemini/schema";

export type CommitResult =
  | { ok: true; kind: "flight" | "stay" | "expense"; rowId: string; created: boolean }
  | { ok: false; error: string };

export async function commitParsedDocument(
  admin: SupabaseClient,
  args: {
    tripId: string;
    docId: string;
    username: string | null;
  }
): Promise<CommitResult> {
  const { tripId, docId, username } = args;

  const { data: docRow, error: dErr } = await admin
    .from("documents")
    .select("id,trip_id,parsed_fields,parsed_status")
    .eq("id", docId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (dErr || !docRow) {
    return { ok: false, error: dErr?.message ?? "Документ не найден" };
  }
  const parsed = ParsedDocument.safeParse((docRow as { parsed_fields: unknown }).parsed_fields);
  if (!parsed.success) {
    return {
      ok: false,
      error: "parsed_fields не соответствует схеме. Запустите анализ заново.",
    };
  }

  const pd: ParsedDocumentT = parsed.data;
  if (pd.type === "unknown") {
    return { ok: false, error: "Документ не распознан. Создавать нечего." };
  }

  // Load trip for base_currency fallback on expenses.
  const { data: trip } = await admin
    .from("trips")
    .select("id,base_currency")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return { ok: false, error: "Поездка не найдена" };
  const baseCurrency = (trip as { base_currency: string }).base_currency || "RUB";

  if (pd.type === "flight") {
    return commitFlight(admin, tripId, docId, pd.flight);
  }
  if (pd.type === "stay") {
    return commitStay(admin, tripId, docId, pd.stay);
  }
  if (pd.type === "expense") {
    return commitExpense(admin, tripId, docId, pd.expense, baseCurrency, username);
  }
  return { ok: false, error: "Неизвестный тип документа" };
}

async function commitFlight(
  admin: SupabaseClient,
  tripId: string,
  docId: string,
  f: FlightFields
): Promise<CommitResult> {
  const { data: existing } = await admin
    .from("flights")
    .select("id")
    .eq("trip_id", tripId)
    .eq("document_id", docId)
    .maybeSingle();
  if (existing) {
    await admin
      .from("documents")
      .update({ parsed_status: "parsed" })
      .eq("id", docId);
    return { ok: true, kind: "flight", rowId: (existing as { id: string }).id, created: false };
  }

  const { data, error } = await admin
    .from("flights")
    .insert({
      trip_id: tripId,
      document_id: docId,
      airline: f.airline,
      code: f.code,
      from_code: f.from_code,
      from_city: f.from_city,
      to_code: f.to_code,
      to_city: f.to_city,
      dep_at: f.dep_at,
      arr_at: f.arr_at,
      seat: f.seat,
      pnr: f.pnr,
      baggage: f.baggage,
      terminal: f.terminal,
      raw: f,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Не удалось создать рейс" };
  }

  await admin
    .from("documents")
    .update({ parsed_status: "parsed", kind: "flight" })
    .eq("id", docId);

  return { ok: true, kind: "flight", rowId: (data as { id: string }).id, created: true };
}

async function commitStay(
  admin: SupabaseClient,
  tripId: string,
  docId: string,
  s: StayFields
): Promise<CommitResult> {
  const { data: existing } = await admin
    .from("stays")
    .select("id")
    .eq("trip_id", tripId)
    .eq("document_id", docId)
    .maybeSingle();
  if (existing) {
    await admin
      .from("documents")
      .update({ parsed_status: "parsed" })
      .eq("id", docId);
    return { ok: true, kind: "stay", rowId: (existing as { id: string }).id, created: false };
  }

  // Try to link the stay to a destination by matching country/city.
  let destinationId: string | null = null;
  if (s.country_code) {
    const { data: dest } = await admin
      .from("destinations")
      .select("id")
      .eq("trip_id", tripId)
      .eq("flag_code", s.country_code.toLowerCase())
      .eq("type", "stay")
      .limit(1)
      .maybeSingle();
    destinationId = (dest as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await admin
    .from("stays")
    .insert({
      trip_id: tripId,
      destination_id: destinationId,
      document_id: docId,
      title: s.title,
      address: s.address,
      check_in: s.check_in,
      check_out: s.check_out,
      host: s.host,
      host_phone: s.host_phone,
      confirmation: s.confirmation,
      price: s.price,
      currency: s.currency,
      raw: s,
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Не удалось создать stay" };
  }

  await admin
    .from("documents")
    .update({ parsed_status: "parsed", kind: "booking" })
    .eq("id", docId);

  return { ok: true, kind: "stay", rowId: (data as { id: string }).id, created: true };
}

async function commitExpense(
  admin: SupabaseClient,
  tripId: string,
  docId: string,
  e: ExpenseFields,
  baseCurrency: string,
  username: string | null
): Promise<CommitResult> {
  const { data: existing } = await admin
    .from("expenses")
    .select("id")
    .eq("trip_id", tripId)
    .eq("document_id", docId)
    .maybeSingle();
  if (existing) {
    await admin
      .from("documents")
      .update({ parsed_status: "parsed" })
      .eq("id", docId);
    return {
      ok: true,
      kind: "expense",
      rowId: (existing as { id: string }).id,
      created: false,
    };
  }

  if (e.amount == null || e.currency == null || !e.occurred_on) {
    return {
      ok: false,
      error: "В расходе не хватает суммы, валюты или даты. Заполните вручную и повторите.",
    };
  }

  const conv = await convert(
    admin,
    e.amount,
    e.currency,
    baseCurrency,
    e.occurred_on
  );
  if (!conv) {
    return {
      ok: false,
      error: `Не удалось получить курс ${e.currency}→${baseCurrency} на ${e.occurred_on}`,
    };
  }

  // Try to attach to a day by matching trip dates.
  let dayId: string | null = null;
  {
    const { data: day } = await admin
      .from("days")
      .select("id")
      .eq("trip_id", tripId)
      .eq("date", e.occurred_on)
      .limit(1)
      .maybeSingle();
    dayId = (day as { id: string } | null)?.id ?? null;
  }

  const { data, error } = await admin
    .from("expenses")
    .insert({
      trip_id: tripId,
      day_id: dayId,
      document_id: docId,
      occurred_on: e.occurred_on,
      category: e.category ?? "other",
      merchant: e.merchant,
      description: e.description,
      amount_original: e.amount,
      currency_original: e.currency,
      amount_base: conv.amount,
      currency_base: baseCurrency,
      rate_date: conv.rate_date,
      rate_used: conv.rate,
      source: "cowork",
      paid_by_username: username,
      created_by_username: username,
      split: "equal",
    })
    .select("id")
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Не удалось создать расход" };
  }

  await admin
    .from("documents")
    .update({ parsed_status: "parsed", kind: "receipt" })
    .eq("id", docId);

  return { ok: true, kind: "expense", rowId: (data as { id: string }).id, created: true };
}
