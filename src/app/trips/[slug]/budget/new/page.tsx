import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import ExpenseForm from "../ExpenseForm";
import {
  createExpenseAction,
  type ExpenseActionState,
} from "../actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Trip = {
  id: string;
  slug: string;
  title: string;
  base_currency: string;
  date_from: string;
  date_to: string;
};

function clampDate(today: string, from: string, to: string): string {
  if (today < from) return from;
  if (today > to) return to;
  return today;
}

export default async function NewExpensePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,base_currency,date_from,date_to")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = clampDate(today, trip.date_from, trip.date_to);

  const bound = async (
    prev: ExpenseActionState,
    formData: FormData
  ): Promise<ExpenseActionState> => {
    "use server";
    return createExpenseAction(slug, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Новый расход"
        subtitle={trip.title}
        back={`/trips/${slug}/budget`}
      />
      <div className="px-5 pb-24 pt-4">
        <ExpenseForm
          tripSlug={slug}
          action={bound}
          defaultDate={defaultDate}
          defaultCurrency={trip.base_currency}
          submitLabel="Добавить"
        />
      </div>
    </>
  );
}
