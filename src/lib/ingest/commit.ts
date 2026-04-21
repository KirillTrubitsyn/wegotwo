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
import {
  createEventsForFlight,
  createEventsForStay,
  createEventsForExpense,
} from "@/lib/ingest/events";
import { resolveDestinationForDate } from "@/lib/trips/destinations";
import { detectStayProvider } from "@/lib/travel/airbnb";
import { ensureAccommodationExpense } from "@/lib/ingest/stay-expense";

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

  // Load trip for base_currency fallback on expenses and timezone
  // for event start_at derivation.
  const { data: trip } = await admin
    .from("trips")
    .select("id,base_currency,primary_tz")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return { ok: false, error: "Поездка не найдена" };
  const baseCurrency =
    (trip as { base_currency: string }).base_currency || "RUB";
  const primaryTz =
    (trip as { primary_tz: string }).primary_tz || "Europe/Moscow";
  const tripCtx = { id: tripId, primary_tz: primaryTz };

  if (pd.type === "flight") {
    const res = await commitFlight(admin, tripId, docId, pd.flight);
    if (res.ok) {
      try {
        await createEventsForFlight(admin, tripCtx, pd.flight, docId);
      } catch (e) {
        console.error("[commit] createEventsForFlight:", e);
      }
    }
    return res;
  }
  if (pd.type === "stay") {
    const res = await commitStay(admin, tripId, docId, pd.stay);
    if (res.ok) {
      // Подтягиваем строку stays целиком — нам нужны lat/lon и booking_url,
      // которые могли быть добавлены при merge либо выведены из confirmation.
      // Это даёт событию правильный Google Maps embed и ссылку на бронь.
      const { data: stay } = await admin
        .from("stays")
        .select(
          "id,document_id,destination_id,title,address,check_in,check_out,host,host_phone,confirmation,price,currency,lat,lon,booking_url,map_url"
        )
        .eq("id", res.rowId)
        .maybeSingle();
      const destId =
        (stay as { destination_id: string | null } | null)?.destination_id ??
        null;
      // Создаём accommodation-расход по цене из документа бронирования
      // (Airbnb / Booking кладёт полную сумму в PDF; раньше мы её
      // сохраняли в stays.price, но в Бюджет она не попадала).
      if (stay) {
        try {
          await ensureAccommodationExpense(
            admin,
            tripId,
            baseCurrency,
            stay as {
              id: string;
              document_id: string | null;
              title: string | null;
              price: number | string | null;
              currency: string | null;
              check_in: string | null;
              destination_id: string | null;
            },
            username
          );
        } catch (e) {
          console.error("[commit] ensureAccommodationExpense:", e);
        }
      }
      try {
        const merged = (stay ?? {}) as Record<string, unknown>;
        await createEventsForStay(
          admin,
          tripCtx,
          {
            title: (merged.title as string | null) ?? pd.stay.title,
            address: (merged.address as string | null) ?? pd.stay.address,
            check_in:
              (merged.check_in as string | null) ?? pd.stay.check_in,
            check_out:
              (merged.check_out as string | null) ?? pd.stay.check_out,
            host: (merged.host as string | null) ?? pd.stay.host,
            host_phone:
              (merged.host_phone as string | null) ?? pd.stay.host_phone,
            confirmation:
              (merged.confirmation as string | null) ?? pd.stay.confirmation,
            price:
              (merged.price as number | null) ??
              (pd.stay.price ?? null),
            currency:
              (merged.currency as string | null) ?? pd.stay.currency,
            country_code: pd.stay.country_code ?? null,
            lat: (merged.lat as number | null) ?? null,
            lon: (merged.lon as number | null) ?? null,
            booking_url: (merged.booking_url as string | null) ?? null,
            map_url: (merged.map_url as string | null) ?? null,
          },
          destId,
          docId
        );
      } catch (e) {
        console.error("[commit] createEventsForStay:", e);
      }
    }
    return res;
  }
  if (pd.type === "expense") {
    const res = await commitExpense(
      admin,
      tripId,
      docId,
      pd.expense,
      baseCurrency,
      username
    );
    if (res.ok) {
      try {
        await createEventsForExpense(admin, tripCtx, pd.expense, docId);
      } catch (e) {
        console.error("[commit] createEventsForExpense:", e);
      }
    }
    return res;
  }
  return { ok: false, error: "Неизвестный тип документа" };
}

async function commitFlight(
  admin: SupabaseClient,
  tripId: string,
  docId: string,
  f: FlightFields
): Promise<CommitResult> {
  // Если Gemini вернул массив segments, первый сегмент промоутим в
  // top-level поля (на случай, если Gemini оставил их пустыми).
  // Для top-level code конкатенируем все номера рейсов, чтобы в
  // списке рейсов сразу было видно полный маршрут «JU 137, JU 680».
  const segs = f.segments ?? [];
  const first = segs[0] ?? null;
  const topLevel = {
    airline: f.airline ?? first?.airline ?? null,
    code:
      f.code ??
      (segs.length > 0
        ? segs.map((s) => s.code).filter((c): c is string => !!c).join(", ") ||
          null
        : null),
    from_code: f.from_code ?? first?.from_code ?? null,
    from_city: f.from_city ?? first?.from_city ?? null,
    to_code: f.to_code ?? segs[segs.length - 1]?.to_code ?? null,
    to_city: f.to_city ?? segs[segs.length - 1]?.to_city ?? null,
    dep_at: f.dep_at ?? first?.dep_at ?? null,
    arr_at: f.arr_at ?? segs[segs.length - 1]?.arr_at ?? null,
    seat: f.seat ?? first?.seat ?? null,
    terminal: f.terminal ?? first?.terminal ?? null,
    baggage: f.baggage ?? first?.baggage ?? null,
    pnr: f.pnr ?? null,
  };

  const payload = {
    airline: topLevel.airline,
    code: topLevel.code,
    from_code: topLevel.from_code,
    from_city: topLevel.from_city,
    to_code: topLevel.to_code,
    to_city: topLevel.to_city,
    dep_at: topLevel.dep_at,
    arr_at: topLevel.arr_at,
    seat: topLevel.seat,
    pnr: topLevel.pnr,
    baggage: topLevel.baggage,
    terminal: topLevel.terminal,
    segments: segs,
    raw: f,
  };

  // Если flights-строка уже есть (reparse того же PDF), обновляем
  // её свежими полями — иначе новые сегменты round-trip билета не
  // попадают в БД и обратный рейс никогда не создаётся.
  const { data: existing } = await admin
    .from("flights")
    .select("id")
    .eq("trip_id", tripId)
    .eq("document_id", docId)
    .maybeSingle();
  if (existing) {
    const id = (existing as { id: string }).id;
    const { error: updErr } = await admin
      .from("flights")
      .update(payload)
      .eq("id", id);
    if (updErr) {
      return { ok: false, error: updErr.message };
    }
    await admin
      .from("documents")
      .update({ parsed_status: "parsed", kind: "flight" })
      .eq("id", docId);
    return { ok: true, kind: "flight", rowId: id, created: false };
  }

  const { data, error } = await admin
    .from("flights")
    .insert({ trip_id: tripId, document_id: docId, ...payload })
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

  // Дедуп: Airbnb и Booking часто присылают два документа на одно
  // бронирование (Reservation Details + Trip Summary, приглашение +
  // подтверждение). Мы склеиваем их в одну строку stays.
  //
  // Матчинг по приоритету:
  //   1) confirmation (точный идентификатор брони)
  //   2) check_in (полный timestamp — обычно уникален в рамках поездки)
  //   3) дата check_in + совпадение нормализованного адреса
  //      (спасает, когда Gemini извлёк разные названия/коды из
  //      двух писем Airbnb на одну и ту же бронь).
  //
  // Если нашли существующий stay: дозаполняем в нём null-поля из
  // нового документа, связываем текущий document_id как дополнительный
  // источник (documents.parsed_fields.merged_into_stay_id), помечаем
  // второй документ parsed и возвращаем id первого. Таким образом в
  // UI бюджета и таймлайне остаётся одна строка, а оба документа
  // видны в /docs и ссылаются на один stay.
  const duplicate = await findDuplicateStay(admin, tripId, s);
  if (duplicate) {
    return await mergeStay(admin, duplicate.id, docId, s);
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

  // Попробуем сразу выписать booking_url из confirmation: Airbnb
  // коды (HM+8 символов) и Booking (10 цифр) мы распознаём, остальное
  // — null. Пользователь позже сможет поправить вручную.
  const bookingUrl =
    detectStayProvider(s.confirmation)?.url ?? null;

  // Основной insert с booking_url. Если миграция phase14 не накатилась,
  // ретраим без этой колонки — не блокируем ingest новых документов.
  const basePayload: Record<string, unknown> = {
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
  };
  let insertRes = await admin
    .from("stays")
    .insert({ ...basePayload, booking_url: bookingUrl })
    .select("id")
    .single();
  if (
    insertRes.error &&
    /booking_url/i.test(insertRes.error.message)
  ) {
    console.warn(
      "[commit] stays.booking_url missing, retrying without it:",
      insertRes.error.message
    );
    insertRes = await admin
      .from("stays")
      .insert(basePayload)
      .select("id")
      .single();
  }
  const { data, error } = insertRes;
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Не удалось создать stay" };
  }

  await admin
    .from("documents")
    .update({ parsed_status: "parsed", kind: "booking" })
    .eq("id", docId);

  return { ok: true, kind: "stay", rowId: (data as { id: string }).id, created: true };
}

/**
 * Normalize an address for dedup comparison. Lowercases, strips
 * punctuation and whitespace, drops the country/postal tail so that
 * "3 Šetalište Kapetana Iva Vizina, Tivat, Opština Tivat 85320"
 * and "3 Šetalište Kapetana Iva Vizina, Тиват" match.
 */
function normalizeAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  return addr
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics
    .replace(/[\d]{4,}/g, "") // drop postal codes
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function checkInDatePart(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

async function findDuplicateStay(
  admin: SupabaseClient,
  tripId: string,
  s: StayFields
): Promise<{ id: string } | null> {
  if (s.confirmation) {
    const { data: dup } = await admin
      .from("stays")
      .select("id")
      .eq("trip_id", tripId)
      .eq("confirmation", s.confirmation)
      .limit(1)
      .maybeSingle();
    if (dup) return dup as { id: string };
  }
  if (s.check_in) {
    const { data: dup } = await admin
      .from("stays")
      .select("id")
      .eq("trip_id", tripId)
      .eq("check_in", s.check_in)
      .limit(1)
      .maybeSingle();
    if (dup) return dup as { id: string };
  }

  // Финальный запасной матч: дата заезда + совпадение нормализованного
  // адреса. Берём все stays поездки — их обычно единицы; сравнение
  // построчно на клиенте дешевле, чем SQL-нормализация адреса.
  const wantDate = checkInDatePart(s.check_in);
  const wantAddr = normalizeAddress(s.address);
  if (wantDate && wantAddr) {
    const { data: rows } = await admin
      .from("stays")
      .select("id,address,check_in")
      .eq("trip_id", tripId);
    for (const row of (rows ?? []) as Array<{
      id: string;
      address: string | null;
      check_in: string | null;
    }>) {
      if (checkInDatePart(row.check_in) !== wantDate) continue;
      if (normalizeAddress(row.address) !== wantAddr) continue;
      return { id: row.id };
    }
  }
  return null;
}

async function mergeStay(
  admin: SupabaseClient,
  stayId: string,
  docId: string,
  s: StayFields
): Promise<CommitResult> {
  // Подтягиваем текущую строку, чтобы дозаполнить null-поля.
  const { data: current } = await admin
    .from("stays")
    .select(
      "id,title,address,check_in,check_out,host,host_phone,confirmation,price,currency,raw"
    )
    .eq("id", stayId)
    .maybeSingle();
  if (!current) {
    return { ok: false, error: "Не удалось загрузить stay для merge" };
  }
  const cur = current as {
    title: string | null;
    address: string | null;
    check_in: string | null;
    check_out: string | null;
    host: string | null;
    host_phone: string | null;
    confirmation: string | null;
    price: number | null;
    currency: string | null;
    raw: unknown;
  };

  const patch: Record<string, unknown> = {};
  const pick = <K extends keyof typeof cur>(
    key: K,
    incoming: (typeof cur)[K] | null | undefined
  ) => {
    if ((cur[key] == null || cur[key] === "") && incoming != null && incoming !== "") {
      patch[key as string] = incoming;
    }
  };
  pick("title", s.title);
  pick("address", s.address);
  pick("check_in", s.check_in);
  pick("check_out", s.check_out);
  pick("host", s.host);
  pick("host_phone", s.host_phone);
  pick("confirmation", s.confirmation);
  pick("price", s.price);
  pick("currency", s.currency);

  // В raw кладём оба документа, чтобы не потерять исходные поля.
  const mergedRaw = {
    ...(cur.raw && typeof cur.raw === "object" ? (cur.raw as object) : {}),
    merged_docs: [
      ...((cur.raw && typeof cur.raw === "object" && "merged_docs" in cur.raw
        ? ((cur.raw as { merged_docs: unknown[] }).merged_docs ?? [])
        : []) as unknown[]),
      s,
    ],
  };
  patch.raw = mergedRaw;

  if (Object.keys(patch).length > 0) {
    await admin.from("stays").update(patch).eq("id", stayId);
  }

  // Помечаем документ parsed и пишем в parsed_fields marker,
  // чтобы в UI было видно, что документ схлопнут в уже существующий stay.
  const { data: doc } = await admin
    .from("documents")
    .select("parsed_fields")
    .eq("id", docId)
    .maybeSingle();
  const pf =
    (doc as { parsed_fields: Record<string, unknown> | null } | null)
      ?.parsed_fields ?? {};
  await admin
    .from("documents")
    .update({
      parsed_status: "parsed",
      kind: "booking",
      parsed_fields: { ...pf, merged_into_stay_id: stayId },
    })
    .eq("id", docId);

  return { ok: true, kind: "stay", rowId: stayId, created: false };
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

  // Привязываем расход к городу (destination), в диапазон дат которого
  // попадает occurred_on. Если город не найден (транзит, траты до/после
  // поездки), destination_id остаётся null — такие расходы попадут в
  // корзину «Без города» в UI бюджета.
  const destinationId = await resolveDestinationForDate(
    admin,
    tripId,
    e.occurred_on
  );

  const { data, error } = await admin
    .from("expenses")
    .insert({
      trip_id: tripId,
      day_id: dayId,
      destination_id: destinationId,
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
      items: e.items ?? [],
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
