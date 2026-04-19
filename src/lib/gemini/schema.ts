/**
 * Zod schemas for the structured output returned by Gemini when we
 * ask it to parse a travel document. Each class of document maps
 * 1:1 to a downstream table:
 *
 *   flight  → public.flights
 *   stay    → public.stays
 *   expense → public.expenses (category defaults to 'restaurant' or
 *             whatever Gemini picked; we let the user edit before commit)
 *
 * `unknown` is what Gemini returns when nothing useful could be
 * extracted (a passport scan, a page of terms and conditions, etc).
 * We keep the raw response in `documents.parsed_fields` either way
 * so the user can see why we gave up.
 *
 * Design notes:
 *   - all fields are nullable; a flight ticket can legitimately
 *     omit seat or PNR; a stay confirmation can omit check-in time.
 *   - dates are ISO 8601 strings (YYYY-MM-DD or full timestamps).
 *     Gemini is instructed to return timestamps in the destination's
 *     local time with a trailing `Z`-less offset. We parse to
 *     timestamptz on commit.
 *   - currencies are 3-letter ISO codes UPPERCASED.
 *   - amounts are numbers, never strings, never formatted.
 */
import { z } from "zod";

// Accept a nullable/optional string. Blank → null. Trim.
const OptStr = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return t.length > 0 ? t : null;
  });

const OptNum = z
  .union([z.number(), z.null()])
  .optional()
  .transform((v) => (v == null ? null : v));

// ISO date-only (YYYY-MM-DD). We let Gemini return null when unsure.
const OptIsoDate = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
  });

// ISO-8601 datetime, may or may not have an offset. Return as-is,
// commit code will promote to timestamptz.
const OptIsoDateTime = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim();
    // very loose validation: 2026-02-23T14:30 or 2026-02-23T14:30:00+03:00
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(t) ? t : null;
  });

const OptCurrency = z
  .union([z.string(), z.null()])
  .optional()
  .transform((v) => {
    if (v == null) return null;
    const t = v.trim().toUpperCase();
    return /^[A-Z]{3}$/.test(t) ? t : null;
  });

export const FlightFields = z.object({
  airline: OptStr,
  code: OptStr, // JU331, U24633
  from_code: OptStr, // IATA, 3 letters
  from_city: OptStr,
  to_code: OptStr,
  to_city: OptStr,
  dep_at: OptIsoDateTime,
  arr_at: OptIsoDateTime,
  seat: OptStr,
  pnr: OptStr,
  baggage: OptStr,
  terminal: OptStr,
});
export type FlightFields = z.infer<typeof FlightFields>;

export const StayFields = z.object({
  title: OptStr, // e.g. "Apartment in Pigalle"
  address: OptStr,
  check_in: OptIsoDateTime,
  check_out: OptIsoDateTime,
  host: OptStr,
  host_phone: OptStr,
  confirmation: OptStr,
  price: OptNum,
  currency: OptCurrency,
  // A 2-letter country code helps us link to destinations.flag_code.
  country_code: OptStr,
});
export type StayFields = z.infer<typeof StayFields>;

// Expense categories mirror the enum in the schema.
const EXPENSE_CATEGORIES = [
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

export const ExpenseFields = z.object({
  merchant: OptStr,
  description: OptStr,
  occurred_on: OptIsoDate,
  amount: OptNum,
  currency: OptCurrency,
  category: z
    .union([z.enum(EXPENSE_CATEGORIES), z.null(), z.string()])
    .optional()
    .transform((v) => {
      if (v == null) return null;
      const cat = String(v).trim().toLowerCase();
      return (EXPENSE_CATEGORIES as readonly string[]).includes(cat)
        ? (cat as (typeof EXPENSE_CATEGORIES)[number])
        : null;
    }),
});
export type ExpenseFields = z.infer<typeof ExpenseFields>;

// Discriminated union by `type`. Gemini always returns a `summary`
// (one-line human label) and a `confidence` score so we can surface
// "needs review" in the UI without extra heuristics.
export const ParsedDocument = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("flight"),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
    flight: FlightFields,
  }),
  z.object({
    type: z.literal("stay"),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
    stay: StayFields,
  }),
  z.object({
    type: z.literal("expense"),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
    expense: ExpenseFields,
  }),
  z.object({
    type: z.literal("unknown"),
    summary: z.string(),
    confidence: z.number().min(0).max(1),
  }),
]);
export type ParsedDocument = z.infer<typeof ParsedDocument>;

/**
 * Response schema passed to Gemini as `responseSchema`. Gemini's
 * structured-output mode requires a plain JSON schema, not Zod, so
 * we mirror the Zod shape by hand. Keep both in sync.
 */
/**
 * Gemini wants the Vertex Schema shape with uppercase Type values.
 * We keep `nullable: true` on every leaf field since a travel doc
 * legitimately omits many of them.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    type: {
      type: "STRING",
      enum: ["flight", "stay", "expense", "unknown"],
    },
    summary: { type: "STRING" },
    confidence: { type: "NUMBER" },
    flight: {
      type: "OBJECT",
      nullable: true,
      properties: {
        airline: { type: "STRING", nullable: true },
        code: { type: "STRING", nullable: true },
        from_code: { type: "STRING", nullable: true },
        from_city: { type: "STRING", nullable: true },
        to_code: { type: "STRING", nullable: true },
        to_city: { type: "STRING", nullable: true },
        dep_at: { type: "STRING", nullable: true },
        arr_at: { type: "STRING", nullable: true },
        seat: { type: "STRING", nullable: true },
        pnr: { type: "STRING", nullable: true },
        baggage: { type: "STRING", nullable: true },
        terminal: { type: "STRING", nullable: true },
      },
    },
    stay: {
      type: "OBJECT",
      nullable: true,
      properties: {
        title: { type: "STRING", nullable: true },
        address: { type: "STRING", nullable: true },
        check_in: { type: "STRING", nullable: true },
        check_out: { type: "STRING", nullable: true },
        host: { type: "STRING", nullable: true },
        host_phone: { type: "STRING", nullable: true },
        confirmation: { type: "STRING", nullable: true },
        price: { type: "NUMBER", nullable: true },
        currency: { type: "STRING", nullable: true },
        country_code: { type: "STRING", nullable: true },
      },
    },
    expense: {
      type: "OBJECT",
      nullable: true,
      properties: {
        merchant: { type: "STRING", nullable: true },
        description: { type: "STRING", nullable: true },
        occurred_on: { type: "STRING", nullable: true },
        amount: { type: "NUMBER", nullable: true },
        currency: { type: "STRING", nullable: true },
        category: { type: "STRING", nullable: true },
      },
    },
  },
  required: ["type", "summary", "confidence"],
} as const;
