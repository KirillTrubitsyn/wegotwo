/**
 * Shared domain types. Supabase-generated types can be regenerated
 * with: npx supabase gen types typescript > src/lib/database.types.ts
 */

export type Currency = "RUB" | "EUR" | "USD" | "CHF" | "GBP";

export type ExpenseCategory =
  | "flight"
  | "transport"
  | "accommodation"
  | "restaurant"
  | "groceries"
  | "tours"
  | "activities"
  | "tickets"
  | "shopping"
  | "telecom"
  | "fees"
  | "other";

export type DocumentKind =
  | "flight"
  | "stay"
  | "excursion"
  | "restaurant"
  | "insurance"
  | "transfer"
  | "rental"
  | "receipt"
  | "other";

export type Trip = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  cover_photo_path: string | null;
  country: string | null;
  date_from: string;
  date_to: string;
  route_summary: string | null;
  base_currency: Currency;
  budget_plan: number | null;
  stats: unknown;
  source_folder: string | null;
  owner_id: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
};
