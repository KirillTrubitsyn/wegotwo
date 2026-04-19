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
    "  1. Classify the document as one of: flight, stay, expense, unknown.",
    "  2. Extract fields into the matching object (flight | stay | expense).",
    "  3. Leave a field null if the document does not contain it. Never invent data.",
    "  4. Use ISO 3-letter currency codes (USD, EUR, RUB, CHF, GBP, ...).",
    "  5. Dates must be ISO 8601 (YYYY-MM-DD for dates, YYYY-MM-DDTHH:MM for datetimes).",
    "  6. When a document shows times in a local timezone, return them in local time",
    "     without a Z suffix; the client converts using the trip destination timezone.",
    "  7. For IATA codes return upper-case 3 letters, for PNR return upper-case 6 chars.",
    "  8. Categories for expense: flight, transport, accommodation, restaurant,",
    "     groceries, tours, activities, tickets, shopping, telecom, fees, other.",
    "  9. `summary` must be a single human line in Russian, e.g. 'Рейс JU331 Москва → Белград 23 фев'.",
    " 10. `confidence` ∈ [0,1]. Use 0.3 when large fields are missing, 0.9 when all key fields are present.",
    " 11. If the document does not fit flight/stay/expense, return type='unknown' with a brief reason in `summary`.",
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
    },
  });

  // The SDK puts the concatenated text in `response.text`; fall back
  // to digging through parts if the convenience getter is missing.
  let raw: string | null = null;
  const anyResp = response as unknown as {
    text?: string;
    candidates?: {
      content?: { parts?: { text?: string }[] };
    }[];
  };
  if (typeof anyResp.text === "string") {
    raw = anyResp.text;
  } else {
    const parts = anyResp.candidates?.[0]?.content?.parts ?? [];
    raw = parts.map((p) => p?.text ?? "").join("");
  }
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
    throw new Error(
      "Gemini returned invalid JSON: " + stripped.slice(0, 200)
    );
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
