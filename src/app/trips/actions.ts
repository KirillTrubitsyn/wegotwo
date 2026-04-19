"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUsername } from "@/lib/auth/current-user";
import { TRIP_COLORS } from "@/lib/trip-colors";

const CURRENCIES = ["RUB", "EUR", "USD", "CHF", "GBP"] as const;

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const baseSchema = z
  .object({
    title: z.string().trim().min(2, "Слишком короткое название").max(80),
    slug: z
      .string()
      .trim()
      .min(2)
      .max(48)
      .regex(slugRe, "Только латиница, цифры и дефис"),
    subtitle: z.string().trim().max(160).optional().or(z.literal("")),
    country: z.string().trim().max(48).optional().or(z.literal("")),
    date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата YYYY-MM-DD"),
    date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата YYYY-MM-DD"),
    base_currency: z.enum(CURRENCIES),
    primary_tz: z.string().trim().min(3).max(48),
    color: z.enum(TRIP_COLORS as [string, ...string[]]),
    route_summary: z.string().trim().max(400).optional().or(z.literal("")),
  })
  .refine((v) => v.date_from <= v.date_to, {
    message: "Дата начала позже даты окончания",
    path: ["date_to"],
  });

export type TripFormErrors = {
  form?: string;
  fields?: Partial<Record<keyof z.infer<typeof baseSchema>, string>>;
};

export type TripActionState = { ok: true } | ({ ok: false } & TripFormErrors);

function extract(formData: FormData) {
  return {
    title: String(formData.get("title") ?? ""),
    slug: String(formData.get("slug") ?? "")
      .toLowerCase()
      .trim(),
    subtitle: String(formData.get("subtitle") ?? ""),
    country: String(formData.get("country") ?? ""),
    date_from: String(formData.get("date_from") ?? ""),
    date_to: String(formData.get("date_to") ?? ""),
    base_currency: String(formData.get("base_currency") ?? "EUR"),
    primary_tz: String(formData.get("primary_tz") ?? "Europe/Moscow"),
    color: String(formData.get("color") ?? "blue"),
    route_summary: String(formData.get("route_summary") ?? ""),
  };
}

function firstIssues(err: z.ZodError<z.infer<typeof baseSchema>>) {
  const out: TripFormErrors["fields"] = {};
  for (const i of err.issues) {
    const key = i.path[0] as keyof z.infer<typeof baseSchema>;
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

export async function createTripAction(
  _prev: TripActionState,
  formData: FormData
): Promise<TripActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const data = extract(formData);
  const parsed = baseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("trips").insert({
    title: parsed.data.title,
    slug: parsed.data.slug,
    subtitle: parsed.data.subtitle || null,
    country: parsed.data.country || null,
    date_from: parsed.data.date_from,
    date_to: parsed.data.date_to,
    base_currency: parsed.data.base_currency,
    primary_tz: parsed.data.primary_tz,
    color: parsed.data.color,
    route_summary: parsed.data.route_summary || null,
    created_by_username: username,
  });

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fields: { slug: "Этот slug уже используется" },
      };
    }
    return { ok: false, form: error.message };
  }

  revalidatePath("/");
  revalidatePath(`/trips/${parsed.data.slug}`);
  redirect(`/trips/${parsed.data.slug}`);
}

export async function updateTripAction(
  currentSlug: string,
  _prev: TripActionState,
  formData: FormData
): Promise<TripActionState> {
  const username = await getCurrentUsername();
  if (!username) return { ok: false, form: "Требуется вход" };

  const data = extract(formData);
  const parsed = baseSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, fields: firstIssues(parsed.error) };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("trips")
    .update({
      title: parsed.data.title,
      slug: parsed.data.slug,
      subtitle: parsed.data.subtitle || null,
      country: parsed.data.country || null,
      date_from: parsed.data.date_from,
      date_to: parsed.data.date_to,
      base_currency: parsed.data.base_currency,
      primary_tz: parsed.data.primary_tz,
      color: parsed.data.color,
      route_summary: parsed.data.route_summary || null,
    })
    .eq("slug", currentSlug);

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        fields: { slug: "Этот slug уже используется" },
      };
    }
    return { ok: false, form: error.message };
  }

  revalidatePath("/");
  revalidatePath(`/trips/${currentSlug}`);
  revalidatePath(`/trips/${parsed.data.slug}`);
  redirect(`/trips/${parsed.data.slug}`);
}

export async function archiveTripAction(slug: string, archive: boolean) {
  const username = await getCurrentUsername();
  if (!username) return;
  const admin = createAdminClient();
  await admin
    .from("trips")
    .update({
      archived_at: archive ? new Date().toISOString() : null,
      status: archive ? "archived" : "planning",
    })
    .eq("slug", slug);
  revalidatePath("/");
  revalidatePath(`/trips/${slug}`);
}

export async function deleteTripAction(slug: string) {
  const username = await getCurrentUsername();
  if (!username) return;
  const admin = createAdminClient();
  await admin.from("trips").delete().eq("slug", slug);
  revalidatePath("/");
  redirect("/");
}
