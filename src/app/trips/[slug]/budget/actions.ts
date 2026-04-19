"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { convert } from "@/lib/rates/cbr";

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
] as const;

const SPLITS = ["equal", "payer"] as const;
const PAYERS = ["kirill", "marina", "both"] as const;

const schema = z.object({
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата YYYY-MM-DD"),
  category: z.enum(CATEGORIES),
  merchant: z.string().trim().max(120).optional().or(z.literal("")),
  description: z.string().trim().max(400).optional().or(z.literal("")),
  amount_original: z
    .string()
    .trim()
    .regex(/^-?\d+(?:[.,]\d{1,2})?$/, "Сумма, например 12.50"),
  // ISO-4217 трёхбуквенный код. Принимаем любой, чтобы поддержать
  // валюту страны пребывания (EUR, CHF, GBP, RSD, JPY, GEL, TRY, …).
  currency_original: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Валюта в формате USD/EUR/…")),
  paid_by_username: z.enum(PAYERS),
  split: z.enum(SPLITS),
});

export type ExpenseFormErrors = {
  form?: string;
  fields?: Partial<Record<keyof z.infer<typeof schema>, string>>;
};

export type ExpenseActionState =
  | { ok: true }
  | ({ ok: false } & ExpenseFormErrors);

function extract(fd: FormData) {
  return {
    occurred_on: String(fd.get("occurred_on") ?? ""),
    category: String(fd.get("category") ?? "other"),
    merchant: String(fd.get("merchant") ?? ""),
    description: String(fd.get("description") ?? ""),
    amount_original: String(fd.get("amount_original") ?? ""),
    currency_original: String(fd.get("currency_original") ?? "EUR"),
    paid_by_username: String(fd.get("paid_by_username") ?? "kirill"),
    split: String(fd.get("split") ?? "equal"),
  };
}

function firstIssues(err: z.ZodError<z.infer<typeof schema>>) {
  const out: ExpenseFormErrors["fields"] = {};
  for (const i of err.issues) {
    const key = i.path[0] as keyof z.infer<typeof schema>;
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

function parseAmount(raw: string): number {
  return Number(raw.replace(",", "."));
}

async function resolveTrip(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select("id,base_currency,date_from,date_to")
    .eq("slug", slug)
    .maybeSingle();
  return data as {
    id: string;
    base_currency: string;
    date_from: string;
    date_to: string;
  } | null;
}

export async function createExpenseAction(
  slug: string,
  _prev: ExpenseActionState,
  fd: FormData
): Promise<ExpenseActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const trip = await resolveTrip(slug);
  if (!trip) return { ok: false, form: "Поездка не найдена" };

  const parsed = schema.safeParse(extract(fd));
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const amount = parseAmount(parsed.data.amount_original);
  if (!Number.isFinite(amount)) {
    return {
      ok: false,
      fields: { amount_original: "Неверная сумма" },
    };
  }

  const admin = createAdminClient();
  const conv = await convert(
    admin,
    amount,
    parsed.data.currency_original,
    trip.base_currency,
    parsed.data.occurred_on
  );

  if (!conv) {
    return {
      ok: false,
      form: "Не удалось получить курс ЦБ на эту дату. Попробуйте позже.",
    };
  }

  const { error } = await admin.from("expenses").insert({
    trip_id: trip.id,
    occurred_on: parsed.data.occurred_on,
    category: parsed.data.category,
    merchant: parsed.data.merchant || null,
    description: parsed.data.description || null,
    amount_original: amount,
    currency_original: parsed.data.currency_original,
    amount_base: conv.amount,
    currency_base: trip.base_currency,
    rate_date: conv.rate_date,
    rate_used: conv.rate,
    paid_by_username: parsed.data.paid_by_username,
    split: parsed.data.split,
    created_by_username: username,
    source: "manual",
  });

  if (error) return { ok: false, form: error.message };

  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}`);
  redirect(`/trips/${slug}/budget`);
}

export async function updateExpenseAction(
  slug: string,
  expenseId: string,
  _prev: ExpenseActionState,
  fd: FormData
): Promise<ExpenseActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const trip = await resolveTrip(slug);
  if (!trip) return { ok: false, form: "Поездка не найдена" };

  const parsed = schema.safeParse(extract(fd));
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const amount = parseAmount(parsed.data.amount_original);
  if (!Number.isFinite(amount)) {
    return { ok: false, fields: { amount_original: "Неверная сумма" } };
  }

  const admin = createAdminClient();
  const conv = await convert(
    admin,
    amount,
    parsed.data.currency_original,
    trip.base_currency,
    parsed.data.occurred_on
  );
  if (!conv) {
    return {
      ok: false,
      form: "Не удалось получить курс ЦБ на эту дату. Попробуйте позже.",
    };
  }

  const { error } = await admin
    .from("expenses")
    .update({
      occurred_on: parsed.data.occurred_on,
      category: parsed.data.category,
      merchant: parsed.data.merchant || null,
      description: parsed.data.description || null,
      amount_original: amount,
      currency_original: parsed.data.currency_original,
      amount_base: conv.amount,
      currency_base: trip.base_currency,
      rate_date: conv.rate_date,
      rate_used: conv.rate,
      paid_by_username: parsed.data.paid_by_username,
      split: parsed.data.split,
    })
    .eq("id", expenseId)
    .eq("trip_id", trip.id);

  if (error) return { ok: false, form: error.message };

  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}`);
  redirect(`/trips/${slug}/budget`);
}

export async function deleteExpenseAction(slug: string, expenseId: string) {
  const username = await getCurrentUsername();
  if (!username) return;
  const admin = createAdminClient();
  await admin.from("expenses").delete().eq("id", expenseId);
  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}`);
}
