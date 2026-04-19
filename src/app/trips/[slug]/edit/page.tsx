import { notFound } from "next/navigation";
import Header from "@/components/Header";
import { createAdminClient } from "@/lib/supabase/admin";
import TripForm from "../../TripForm";
import { updateTripAction } from "../../actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Редактирование поездки" };

type Trip = {
  title: string;
  slug: string;
  subtitle: string | null;
  country: string | null;
  date_from: string;
  date_to: string;
  base_currency: string;
  primary_tz: string;
  color: string;
  route_summary: string | null;
};

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data } = await admin
    .from("trips")
    .select(
      "title,slug,subtitle,country,date_from,date_to,base_currency,primary_tz,color,route_summary"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (!data) notFound();
  const trip = data as Trip;

  const action = updateTripAction.bind(null, slug);

  return (
    <>
      <Header title="Редактирование" back={`/trips/${slug}`} />
      <div className="px-5 pb-32 pt-2">
        <TripForm
          action={action}
          submitLabel="Сохранить изменения"
          initial={{
            title: trip.title,
            slug: trip.slug,
            subtitle: trip.subtitle ?? "",
            country: trip.country ?? "",
            date_from: trip.date_from,
            date_to: trip.date_to,
            base_currency: trip.base_currency,
            primary_tz: trip.primary_tz,
            color: trip.color,
            route_summary: trip.route_summary ?? "",
          }}
        />
      </div>
    </>
  );
}
