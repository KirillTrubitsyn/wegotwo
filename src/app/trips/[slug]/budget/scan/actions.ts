"use server";

/**
 * Server actions for the receipt-scan flow (этап 12).
 *
 * Two entry points:
 *   - uploadReceiptAction(slug, prev, fd)
 *       Принимает одно изображение (JPEG/PNG/WebP/HEIC после клиентской
 *       конвертации в JPEG), загружает в bucket documents, создаёт
 *       documents row (kind='receipt', source='cowork'), прогоняет
 *       через Gemini, сохраняет parsed_fields с parsed_status
 *       needs_review и редиректит на /budget/scan/<docId>, где
 *       пользователь редактирует поля перед коммитом.
 *   - commitScanAction(slug, docId, prev, fd)
 *       Подтягивает существующий documents row, переписывает
 *       parsed_fields значениями из формы (дата, сумма, валюта,
 *       категория, merchant, description), форсирует type='expense'
 *       и отдаёт в commitParsedDocument.
 *   - discardScanAction(slug, docId)
 *       Полностью удаляет загруженный скан — и documents row, и
 *       объект в Storage. Нужен если скан получился мутный и
 *       пользователь решил не сохранять его.
 *
 * Скан уникален тем, что коммит идёт после редактирования (в отличие
 * от /docs/[docId], где commit опирается на parsed_fields as-is),
 * поэтому здесь не используется общий IngestPanel.
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import {
  DOCS_BUCKET,
  sha256Hex,
  storagePathFor,
} from "@/lib/docs/storage";
import { extForMime } from "@/lib/docs/labels";
import { parseDocument, type TripContext } from "@/lib/gemini/client";
import {
  ParsedDocument,
  type ParsedDocument as ParsedDocumentT,
} from "@/lib/gemini/schema";
import { commitParsedDocument } from "@/lib/ingest/commit";
import type { ExpenseItem } from "@/lib/gemini/schema";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

// На сервере принимаем до 12 МБ — iPhone обычно выдаёт 3–6 МБ
// полноразмерный JPEG, 12 МБ с большим запасом.
const MAX_BYTES = 12 * 1024 * 1024;

export type ScanUploadState =
  | { ok: true }
  | { ok: false; form?: string };

export type ScanCommitErrors = {
  form?: string;
  fields?: {
    occurred_on?: string;
    amount_original?: string;
    currency_original?: string;
    category?: string;
  };
};

export type ScanCommitState =
  | { ok: true }
  | ({ ok: false } & ScanCommitErrors);

async function resolveTrip(slug: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select("id,title,date_from,date_to,base_currency")
    .eq("slug", slug)
    .maybeSingle();
  return data as
    | {
        id: string;
        title: string;
        date_from: string;
        date_to: string;
        base_currency: string;
      }
    | null;
}

async function loadTripContext(
  tripId: string,
  trip: { title: string; date_from: string; date_to: string; base_currency: string }
): Promise<TripContext> {
  const admin = createAdminClient();
  const { data: dests } = await admin
    .from("destinations")
    .select("name,country,flag_code")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });
  return {
    title: trip.title,
    dateFrom: trip.date_from,
    dateTo: trip.date_to,
    baseCurrency: trip.base_currency,
    destinations: ((dests ?? []) as {
      name: string;
      country: string | null;
      flag_code: string | null;
    }[]).map((d) => ({
      name: d.name,
      country: d.country,
      flagCode: d.flag_code,
    })),
  };
}

export async function uploadReceiptAction(
  slug: string,
  _prev: ScanUploadState,
  fd: FormData
): Promise<ScanUploadState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const trip = await resolveTrip(slug);
  if (!trip) return { ok: false, form: "Поездка не найдена" };

  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, form: "Выберите или сделайте снимок чека" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, form: "Файл больше 12 МБ. Пересоздайте снимок." };
  }
  const mime = (file.type || "image/jpeg").toLowerCase();
  if (!ALLOWED_MIME.has(mime)) {
    return {
      ok: false,
      form: "Поддерживаются JPG, PNG, WebP, HEIC",
    };
  }

  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const hash = await sha256Hex(ab);

  const admin = createAdminClient();

  // Dedup по (trip_id, content_hash): если пользователь повторно
  // загрузил тот же снимок, ведём его к прежнему docId, пусть
  // редактирует уже распознанные поля.
  const { data: existing } = await admin
    .from("documents")
    .select("id")
    .eq("trip_id", trip.id)
    .eq("content_hash", hash)
    .maybeSingle();

  let docId: string;
  if ((existing as { id: string } | null)?.id) {
    docId = (existing as { id: string }).id;
  } else {
    const id =
      typeof crypto.randomUUID === "function" ? crypto.randomUUID() : "";
    if (!id) return { ok: false, form: "Не удалось сгенерировать id" };

    const ext = extForMime(mime, "jpg");
    const storagePath = storagePathFor(trip.id, id, ext);
    const up = await admin.storage
      .from(DOCS_BUCKET)
      .upload(storagePath, bytes, { contentType: mime, upsert: false });
    if (up.error) return { ok: false, form: up.error.message };

    const title =
      file.name && file.name !== "blob"
        ? file.name
        : `Скан чека ${new Date().toISOString().slice(0, 10)}`;

    const { error: insErr } = await admin.from("documents").insert({
      id,
      trip_id: trip.id,
      kind: "receipt",
      title,
      storage_path: storagePath,
      size_bytes: file.size,
      mime,
      content_hash: hash,
      source: "cowork",
      uploaded_by_username: username,
    });
    if (insErr) {
      await admin.storage.from(DOCS_BUCKET).remove([storagePath]);
      return { ok: false, form: insErr.message };
    }
    docId = id;
  }

  // Анализ через Gemini. Ошибка не фатальна: пусть пользователь
  // попадёт на страницу предпросмотра и заполнит поля руками.
  try {
    const ctx = await loadTripContext(trip.id, trip);
    const parsed = await parseDocument({ bytes, mime, trip: ctx });
    await admin
      .from("documents")
      .update({
        parsed_fields: parsed,
        parsed_status: "needs_review",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", docId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await admin
      .from("documents")
      .update({
        parsed_status: "failed",
        parsed_at: new Date().toISOString(),
        parsed_fields: { error: msg },
      })
      .eq("id", docId);
  }

  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}/docs`);
  redirect(`/trips/${slug}/budget/scan/${docId}`);
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
] as const;

const commitSchema = z.object({
  occurred_on: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Дата YYYY-MM-DD"),
  category: z.enum(CATEGORIES),
  merchant: z.string().trim().max(160).optional(),
  description: z.string().trim().max(400).optional(),
  amount_original: z
    .string()
    .trim()
    .regex(/^-?\d+(?:[.,]\d{1,2})?$/, "Сумма, например 12,50"),
  currency_original: z
    .string()
    .trim()
    .transform((s) => s.toUpperCase())
    .pipe(z.string().regex(/^[A-Z]{3}$/, "Валюта в формате USD/EUR/…")),
});

function parseAmount(raw: string): number {
  return Number(raw.replace(",", "."));
}

export async function commitScanAction(
  slug: string,
  docId: string,
  _prev: ScanCommitState,
  fd: FormData
): Promise<ScanCommitState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const trip = await resolveTrip(slug);
  if (!trip) return { ok: false, form: "Поездка не найдена" };

  const admin = createAdminClient();
  const { data: docRow } = await admin
    .from("documents")
    .select("id,trip_id,parsed_fields")
    .eq("id", docId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!docRow) return { ok: false, form: "Документ не найден" };

  const raw = {
    occurred_on: String(fd.get("occurred_on") ?? "").trim(),
    category: String(fd.get("category") ?? "other"),
    merchant: String(fd.get("merchant") ?? "").trim(),
    description: String(fd.get("description") ?? "").trim(),
    amount_original: String(fd.get("amount_original") ?? "").trim(),
    currency_original: String(fd.get("currency_original") ?? "").trim(),
  };

  const parsed = commitSchema.safeParse(raw);
  if (!parsed.success) {
    const fields: ScanCommitErrors["fields"] = {};
    for (const i of parsed.error.issues) {
      const k = i.path[0] as keyof NonNullable<ScanCommitErrors["fields"]>;
      if (k && !fields[k]) fields[k] = i.message;
    }
    return { ok: false, fields };
  }

  const amount = parseAmount(parsed.data.amount_original);
  if (!Number.isFinite(amount)) {
    return { ok: false, fields: { amount_original: "Неверная сумма" } };
  }

  // Сохраняем исходный summary/confidence от Gemini, если они есть,
  // иначе собираем свои — commitParsedDocument этот объект
  // повторно валидирует через Zod.
  const prior = (docRow as { parsed_fields: unknown }).parsed_fields as
    | {
        type?: string;
        summary?: string;
        confidence?: number;
      }
    | null
    | undefined;

  const merchant = parsed.data.merchant || null;
  const description = parsed.data.description || null;

  // Собираем позиции чека и сплит «Кирилл / общее / Марина» из формы.
  // Клиент отправляет параллельные массивы items_description[],
  // items_amount[] и items_share[] (значение share ∈ {k, common, m}).
  // Сплит считаем в исходной валюте чека; в базу пишем в
  // expenses.items (массив) и expenses.split_summary (агрегаты).
  const itemDescs = fd.getAll("items_description").map((v) => String(v ?? ""));
  const itemAmts = fd.getAll("items_amount").map((v) => String(v ?? ""));
  const itemShares = fd.getAll("items_share").map((v) => String(v ?? "common"));
  const items: (ExpenseItem & { share: "k" | "common" | "m" })[] = [];
  for (let i = 0; i < itemDescs.length; i++) {
    const desc = itemDescs[i].trim();
    const amtRaw = itemAmts[i]?.trim() ?? "";
    const shareRaw = itemShares[i]?.trim().toLowerCase() ?? "common";
    const share: "k" | "common" | "m" =
      shareRaw === "k" || shareRaw === "m" ? shareRaw : "common";
    const amt = amtRaw ? Number(amtRaw.replace(",", ".")) : null;
    if (!desc && (amt == null || !Number.isFinite(amt))) continue;
    items.push({
      description: desc || null,
      amount: amt != null && Number.isFinite(amt) ? amt : null,
      share,
    });
  }

  // split_summary: kirill / common / marina — сумма позиций в своей
  // группе плюс общая часть делится пополам. Считаем в исходной валюте.
  let splitSummary:
    | { kirill: number; marina: number; common: number; currency: string }
    | null = null;
  if (items.length > 0) {
    let k = 0;
    let m = 0;
    let c = 0;
    for (const it of items) {
      if (it.amount == null) continue;
      if (it.share === "k") k += it.amount;
      else if (it.share === "m") m += it.amount;
      else c += it.amount;
    }
    splitSummary = {
      kirill: Math.round((k + c / 2) * 100) / 100,
      marina: Math.round((m + c / 2) * 100) / 100,
      common: Math.round(c * 100) / 100,
      currency: parsed.data.currency_original,
    };
  }

  const nextFields: ParsedDocumentT = {
    type: "expense",
    summary:
      prior?.summary ??
      `${merchant ?? "Чек"} — ${parsed.data.amount_original} ${parsed.data.currency_original}`,
    confidence:
      typeof prior?.confidence === "number" ? prior.confidence : 0.8,
    expense: {
      merchant,
      description,
      occurred_on: parsed.data.occurred_on,
      amount,
      currency: parsed.data.currency_original,
      category: parsed.data.category,
      items: items.map((it) => ({
        description: it.description,
        amount: it.amount,
      })),
    },
  };

  // Прогоняем через Zod-схему, чтобы быть уверенными: commit не
  // споткнётся на safeParse в commitParsedDocument.
  const valid = ParsedDocument.safeParse(nextFields);
  if (!valid.success) {
    return { ok: false, form: "Не удалось собрать валидный parsed_fields" };
  }

  const { error: updErr } = await admin
    .from("documents")
    .update({ parsed_fields: valid.data, parsed_status: "needs_review" })
    .eq("id", docId);
  if (updErr) return { ok: false, form: updErr.message };

  const res = await commitParsedDocument(admin, {
    tripId: trip.id,
    docId,
    username,
  });
  if (!res.ok) return { ok: false, form: res.error };

  // split_summary живёт отдельно от parsed_fields: сам разбор делал
  // пользователь в форме, а не Gemini, поэтому мы пишем его напрямую
  // в expenses.split_summary после того, как commit создал row.
  if (res.kind === "expense" && splitSummary) {
    await admin
      .from("expenses")
      .update({ split_summary: splitSummary })
      .eq("id", res.rowId);
  }

  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}/docs`);
  revalidatePath(`/trips/${slug}`);
  redirect(`/trips/${slug}/budget`);
}

export async function discardScanAction(slug: string, docId: string) {
  const username = await getCurrentUsername();
  if (!username) return;

  const admin = createAdminClient();
  const { data: trip } = await admin
    .from("trips")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (!trip) return;
  const tripId = (trip as { id: string }).id;

  const { data: doc } = await admin
    .from("documents")
    .select("id,storage_path")
    .eq("id", docId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (!doc) return;
  const row = doc as { id: string; storage_path: string | null };

  await admin.from("documents").delete().eq("id", row.id);
  if (row.storage_path) {
    await admin.storage.from(DOCS_BUCKET).remove([row.storage_path]);
  }

  revalidatePath(`/trips/${slug}/budget`);
  revalidatePath(`/trips/${slug}/docs`);
  redirect(`/trips/${slug}/budget`);
}
