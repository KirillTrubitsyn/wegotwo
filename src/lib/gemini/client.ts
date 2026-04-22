/**
 * Thin wrapper around @google/genai for document parsing.
 *
 * The one exported entry point `parseDocument` takes the raw bytes
 * of a PDF or image plus lightweight trip context, sends it to
 * Gemini in structured-output mode, parses the response through
 * the Zod schema in `./schema`, and returns the result.
 *
 * Runtime contract:
 *   - must run on the Node.js runtime (we pass binary bytes)
 *   - caller enforces the 60s Vercel max duration
 *   - throws Error with a user-visible message on failure (missing
 *     key, bad response, unsupported mime, Gemini refusal)
 */
import "server-only";
import { GoogleGenAI } from "@google/genai";
import {
  GEMINI_RESPONSE_SCHEMA,
  ParsedDocument,
  type ParsedDocument as ParsedDocumentT,
} from "./schema";

export type TripContext = {
  title: string;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  baseCurrency: string;
  destinations: { name: string; country: string | null; flagCode: string | null }[];
};

const SUPPORTED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

function buildSystemInstruction(ctx: TripContext): string {
  const dests =
    ctx.destinations.length > 0
      ? ctx.destinations
          .map((d) =>
            [d.name, d.country, d.flagCode ? `[${d.flagCode}]` : null]
              .filter(Boolean)
              .join(" ")
          )
          .join("; ")
      : "не указаны";
  return [
    "You are a parser of travel documents for a trip planning app.",
    "The user uploads a PDF or image (plane ticket, hotel/Airbnb booking,",
    "restaurant receipt, museum ticket, transfer voucher, etc).",
    "",
    `Trip: ${ctx.title}. Dates: ${ctx.dateFrom} → ${ctx.dateTo}.`,
    `Base currency: ${ctx.baseCurrency}. Destinations: ${dests}.`,
    "",
    "TASK:",
    "  1. Classify the document as one of: flight, stay, expense, city_summary, unknown.",
    "  2. Extract fields into the matching object (flight | stay | expense | city_summary).",
    "  3. Leave a field null if the document does not contain it. Never invent data.",
    "  4. Use ISO 3-letter currency codes (USD, EUR, RUB, CHF, GBP, RSD, ...).",
    `     If the document does not state a currency explicitly but the`,
    `     receipt was clearly issued in the trip's country, use the trip`,
    `     base currency (${ctx.baseCurrency}). Never leave currency null`,
    "     when a numeric amount is present.",
    "  5. Dates must be ISO 8601 (YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM for datetimes).",
    "  6. Times in the document are printed in the LOCAL timezone of the",
    "     departure airport / hotel / venue. Return datetimes EXACTLY as",
    "     printed (e.g. `2026-05-01T02:55`) — NEVER append an offset or a",
    "     `Z` suffix, and NEVER convert to UTC. The client handles TZ math.",
    "  7. For IATA codes return upper-case 3 letters, for PNR return upper-case 6 chars.",
    "  8. Categories for expense: flight, transport, accommodation, restaurant,",
    "     groceries, tours, activities, tickets, shopping, telecom, fees, other.",
    "  9. `summary` must be a single human line in Russian, e.g. 'Рейс JU331 Москва → Белград 23 фев'.",
    " 10. `confidence` ∈ [0,1]. Use 0.3 when large fields are missing, 0.9 when all key fields are present.",
    " 11. If the document does not fit flight/stay/expense, return type='unknown' with a brief reason in `summary`.",
    "",
    "MULTI-SEGMENT FLIGHTS (CRITICAL — do not skip):",
    "  A single e-ticket PDF almost always lists MULTIPLE legs: both an",
    "  outbound and a return, and possibly layovers in between (e.g.",
    "  SVO → BEG → TIV going out, TIV → BEG → SVO coming back).",
    "  You MUST fill the `segments` array IN BOARDING ORDER with one",
    "  entry per leg. A round-trip PDF → at least 2 segments. Do NOT",
    "  collapse the whole itinerary into a single segment. Do NOT omit",
    "  the return leg even if it is on a later page or in a smaller",
    "  font. Scan the whole document end-to-end.",
    "  Each segment keeps its own airline, flight code, from/to codes",
    "  and cities, dep_at/arr_at, seat, terminal, baggage. Also fill the",
    "  top-level flight fields with the FIRST segment's data (so old",
    "  code that does not read segments still sees the initial leg).",
    "  For the top-level `code` you may concatenate all flight numbers",
    "  comma-separated. Only for genuinely one-way tickets (no return",
    "  leg printed anywhere) leave `segments` empty and fill the",
    "  top-level fields only.",
    "",
    "RESTAURANT LINE ITEMS:",
    "  When the document is a restaurant/bar/cafe receipt with an itemized",
    "  list of dishes or drinks, fill `expense.items` with one entry per",
    "  line: `description` is the dish/drink name (preserve the language",
    "  on the receipt), `amount` is the gross price for that line as",
    "  printed (including quantity, before any service charge or tip).",
    "  Put the grand total (with service/tip if the document charges it)",
    "  into `expense.amount`. If the receipt is NOT a restaurant/cafe",
    "  itemized bill, leave `items` empty.",
    "",
    "TOUR / EXCURSION TICKETS (Tripster, Трипстер, GetYourGuide, Viator):",
    "  When the document is a booked excursion / tour / activity ticket,",
    "  return type='expense' with category='tours' (or 'activities'",
    "  for classes/workshops) and fill these extra fields:",
    "    - `tour_url` — the permanent URL to the tour page",
    "      (e.g. https://experience.tripster.ru/experience/NNNNN/)",
    "    - `guide_name` — full name of the guide/host if present",
    "    - `guide_phone` — the guide's phone in E.164",
    "    - `paid_amount` + `paid_currency` — the prepayment / deposit",
    "      that was charged online (Tripster calls this «Предоплата»,",
    "      обычно 20%).  This is what was ALREADY PAID.",
    "    - `due_amount` + `due_currency` — the balance to be paid on",
    "      site in cash or card (Tripster: «Доплата гиду»).",
    "    - `start_time` / `end_time` — HH:MM local start and end times",
    "      of the excursion itself (NOT the booking creation time).",
    "    - `extras` — array of explicit add-on costs that are payable",
    "      separately (entrance fees, boat rides, tastings, etc.).",
    "      Each item: { label (short Russian name), amount, currency }.",
    "  `expense.amount` on a tour ticket is the TOTAL price of the",
    "  excursion (paid_amount + due_amount if both are stated, or the",
    "  single sum if only one is printed). `expense.description` is a",
    "  one-line human title, e.g. «Черногория со вкусом устриц и вина».",
    "  For non-tour receipts leave all these fields null / empty.",
    "",
    "CITY SUMMARIES (туристические буклеты, путеводители, страница",
    "тура «О направлении» / «Что вас ждёт»):",
    "  Когда документ — это обзор города/направления (без рейсов,",
    "  броней, чеков, билетов), верни type='city_summary' и заполни",
    "  блок `city_summary`:",
    "    - `city_name` — название города как написано в документе",
    "      (любой язык). Если документ описывает несколько городов",
    "      одной поездки — выбери тот, что упомянут первым / в",
    "      заголовке. Не сшивай два города в одну запись.",
    "    - `country_code` — 2-буквенный ISO-код страны (ME, RS, FR, ...).",
    "    - `summary` — краткий обзор города на русском в формате",
    "      markdown: 1–4 коротких абзаца (что посмотреть, чем",
    "      известен, какая атмосфера, особенности кухни/транспорта).",
    "      Никаких заголовков `#`, никаких маркированных списков —",
    "      только обычные абзацы и, при необходимости, **жирное** или",
    "      *курсив*. Не пересказывай весь документ дословно — суть",
    "      должна уложиться в ~600 символов.",
    "  `summary` (top-level) — однострочное человеческое описание,",
    "  например «Краткий обзор Тивата». `confidence` ставь 0.6–0.9 в",
    "  зависимости от того, насколько уверенно опознан город.",
    "  Если документ — программа экскурсии с расписанием и ценой,",
    "  это всё ещё type='expense' с category='tours' (см. выше).",
    "  city_summary — только для чисто описательных материалов.",
    "",
    "Return ONLY valid JSON matching the provided schema. Do not include markdown fences.",
  ].join("\n");
}

/**
 * Parse a document via Gemini. Returns the structured result.
 * `bytes` should be the raw file bytes, `mime` the MIME type.
 */
export async function parseDocument(args: {
  bytes: Uint8Array;
  mime: string;
  trip: TripContext;
}): Promise<ParsedDocumentT> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured on the server");
  }
  const modelName =
    process.env.GEMINI_MODEL?.trim() || "gemini-3.1-flash-lite-preview";

  const mime = args.mime || "application/octet-stream";
  if (!SUPPORTED_MIME.has(mime)) {
    throw new Error(
      `Unsupported MIME type for ingest: ${mime}. Use PDF, JPEG, PNG, WebP or HEIC.`
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  // Gemini accepts bytes inline for <20 MB payloads; our docs are
  // capped at 25 MB at the upload step, so we treat the inline path
  // as primary. The SDK accepts base64 via `inlineData.data`.
  const b64 = Buffer.from(
    args.bytes.buffer,
    args.bytes.byteOffset,
    args.bytes.byteLength
  ).toString("base64");

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Parse this document into the structured JSON." },
          { inlineData: { mimeType: mime, data: b64 } },
        ],
      },
    ],
    config: {
      systemInstruction: buildSystemInstruction(args.trip),
      responseMimeType: "application/json",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      responseSchema: GEMINI_RESPONSE_SCHEMA as any,
      temperature: 0,
      // Дефолтный maxOutputTokens у flash-lite-preview мал (1–2k), и
      // ответ обрезается по середине строки, ронял JSON.parse.
      // 8192 хватает с запасом на самый богатый Tripster-билет
      // (stay + tour + extras + items).
      maxOutputTokens: 8192,
    },
  });

  // The SDK puts the concatenated text in `response.text`; fall back
  // to digging through parts if the convenience getter is missing.
  let raw: string | null = null;
  const anyResp = response as unknown as {
    text?: string;
    candidates?: {
      content?: { parts?: { text?: string }[] };
      finishReason?: string;
    }[];
  };
  if (typeof anyResp.text === "string") {
    raw = anyResp.text;
  } else {
    const parts = anyResp.candidates?.[0]?.content?.parts ?? [];
    raw = parts.map((p) => p?.text ?? "").join("");
  }
  const finishReason = anyResp.candidates?.[0]?.finishReason ?? null;
  if (!raw) {
    throw new Error("Gemini returned an empty response");
  }

  // Structured-output mode should return plain JSON, but we strip
  // a leading ```json fence defensively.
  const stripped = raw
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  let obj: unknown;
  try {
    obj = JSON.parse(stripped);
  } catch {
    // Gemini иногда режет ответ по середине (MAX_TOKENS). Пробуем
    // грубо дозакрыть открытые строки/скобки; это не идеально, но
    // спасает типичный паттерн «оборвалось на поле description».
    const repaired = tryRepairJson(stripped);
    if (repaired) {
      try {
        obj = JSON.parse(repaired);
      } catch {
        throw new Error(
          buildParseErrorMessage(stripped, finishReason)
        );
      }
    } else {
      throw new Error(buildParseErrorMessage(stripped, finishReason));
    }
  }

  const parsed = ParsedDocument.safeParse(obj);
  if (!parsed.success) {
    throw new Error(
      "Gemini response did not match schema: " +
        parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    );
  }

  return parsed.data;
}

/**
 * Попробовать закрыть обрезанный JSON: находим последнюю открытую
 * строку `"…`, обрезаем её до последней валидной точки, затем
 * добавляем нужное число `}` / `]` для баланса. Возвращаем null,
 * если структура слишком разломана.
 */
function tryRepairJson(s: string): string | null {
  if (!s || s.length < 2) return null;
  let out = s;

  // Шаг 1: если ответ обрывается внутри строкового значения
  // (нечётное число неэкранированных кавычек) — обрезаем всё после
  // последней валидной запятой/скобки и закрываем строку.
  const quoteCount = countUnescaped(out, '"');
  if (quoteCount % 2 === 1) {
    // Последний надёжный якорь: самая правая запятая или {…[ на
    // корректной глубине. Для простоты — режем по последнему `"` и
    // закрываем кавычкой.
    const lastQuote = out.lastIndexOf('"');
    if (lastQuote > 0) {
      out = out.slice(0, lastQuote) + '""';
    } else {
      return null;
    }
  }

  // Шаг 2: отрезать висящую запятую.
  out = out.replace(/,\s*$/, "");

  // Шаг 3: досыпать недостающие }/] до баланса.
  let openBraces = 0;
  let openBrackets = 0;
  let inStr = false;
  let esc = false;
  for (const c of out) {
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === '"') inStr = !inStr;
    if (inStr) continue;
    if (c === "{") openBraces++;
    else if (c === "}") openBraces--;
    else if (c === "[") openBrackets++;
    else if (c === "]") openBrackets--;
  }
  if (openBraces < 0 || openBrackets < 0) return null;
  out += "]".repeat(openBrackets) + "}".repeat(openBraces);
  return out;
}

function countUnescaped(s: string, ch: string): number {
  let n = 0;
  let esc = false;
  for (const c of s) {
    if (esc) {
      esc = false;
      continue;
    }
    if (c === "\\") {
      esc = true;
      continue;
    }
    if (c === ch) n++;
  }
  return n;
}

function buildParseErrorMessage(
  raw: string,
  finishReason: string | null
): string {
  const reason = finishReason ? ` (finish_reason=${finishReason})` : "";
  const hint =
    finishReason === "MAX_TOKENS"
      ? " — ответ обрезан по лимиту токенов, поднимите GEMINI_MAX_OUTPUT_TOKENS"
      : "";
  return `Gemini returned invalid JSON${reason}${hint}: ${raw.slice(0, 200)}…`;
}
