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
  items: { description?: string | null; amount?: number | null }[] | null;
  split_summary: {
    kirill?: number;
    marina?: number;
    common?: number;
    currency?: string;
  } | null;
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
      "id,occurred_on,category,merchant,description,amount_original,currency_original,paid_by_username,split,items,split_summary"
    )
    .eq("id", expenseId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!expData) notFound();
  const expense = expData as ExpenseRow;
  const items = Array.isArray(expense.items) ? expense.items : [];
  const split = expense.split_summary;

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
        {(items.length > 0 || split) && (
          <section className="bg-white rounded-card shadow-card p-5 space-y-3">
            <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
              Позиции чека
            </div>
            {items.length > 0 && (
              <ul className="text-[13px] text-text-main space-y-1">
                {items.map((it, idx) => (
                  <li
                    key={idx}
                    className="flex justify-between gap-2 border-b border-black/[0.04] pb-1 last:border-b-0 last:pb-0"
                  >
                    <span className="truncate">
                      {it?.description || "Позиция"}
                    </span>
                    <span className="font-mono tnum text-text-sec">
                      {typeof it?.amount === "number"
                        ? it.amount.toLocaleString("ru-RU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {split && (
              <div className="bg-blue-lt rounded-btn p-3 grid grid-cols-3 gap-2 text-center">
                {(["kirill", "common", "marina"] as const).map((k) => (
                  <div key={k}>
                    <div className="text-[10px] uppercase tracking-[0.5px] text-text-sec font-semibold">
                      {k === "kirill" ? "Кирилл" : k === "marina" ? "Марина" : "Общее"}
                    </div>
                    <div className="text-[14px] font-semibold text-text-main tnum">
                      {typeof split[k] === "number"
                        ? (split[k] as number).toLocaleString("ru-RU", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : "—"}{" "}
                      <span className="text-[11px] text-text-sec">
                        {split.currency ?? expense.currency_original}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

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
