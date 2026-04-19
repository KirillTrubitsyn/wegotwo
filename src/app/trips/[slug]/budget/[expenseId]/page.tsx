import { notFound, redirect } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import ExpenseForm from "../ExpenseForm";
import {
  updateExpenseAction,
  deleteExpenseAction,
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

type ExpenseRow = {
  id: string;
  occurred_on: string;
  category: string;
  merchant: string | null;
  description: string | null;
  amount_original: number | string;
  currency_original: string;
  paid_by_username: string | null;
  split: string;
};

function amountToString(v: number | string): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "";
  // Keep decimals trimmed: 12 stays "12", 12.5 stays "12.5".
  return String(n);
}

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ slug: string; expenseId: string }>;
}) {
  const { slug, expenseId } = await params;

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,base_currency,date_from,date_to")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: expData } = await admin
    .from("expenses")
    .select(
      "id,occurred_on,category,merchant,description,amount_original,currency_original,paid_by_username,split"
    )
    .eq("id", expenseId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!expData) notFound();
  const expense = expData as ExpenseRow;

  const bound = async (
    prev: ExpenseActionState,
    formData: FormData
  ): Promise<ExpenseActionState> => {
    "use server";
    return updateExpenseAction(slug, expenseId, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Изменить расход"
        subtitle={trip.title}
        back={`/trips/${slug}/budget`}
      />
      <div className="px-5 pb-24 pt-4 space-y-5">
        <ExpenseForm
          tripSlug={slug}
          action={bound}
          defaultDate={expense.occurred_on}
          defaultCurrency={trip.base_currency}
          submitLabel="Сохранить"
          initial={{
            occurred_on: expense.occurred_on,
            category: expense.category,
            merchant: expense.merchant,
            description: expense.description,
            amount_original: amountToString(expense.amount_original),
            currency_original: expense.currency_original,
            paid_by_username: expense.paid_by_username,
            split: expense.split,
          }}
        />

        <form
          action={async () => {
            "use server";
            await deleteExpenseAction(slug, expenseId);
            redirect(`/trips/${slug}/budget`);
          }}
        >
          <button
            type="submit"
            className="w-full bg-white border border-accent/20 text-accent rounded-btn py-[12px] text-[14px] font-medium active:bg-red-lt"
          >
            Удалить расход
          </button>
        </form>
      </div>
    </>
  );
}
