import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import DocForm from "../DocForm";
import {
  uploadDocumentAction,
  type DocActionState,
} from "../actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Trip = { id: string; slug: string; title: string };

export default async function NewDocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const bound = async (
    prev: DocActionState,
    formData: FormData
  ): Promise<DocActionState> => {
    "use server";
    return uploadDocumentAction(slug, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Новый документ"
        subtitle={trip.title}
        back={`/trips/${slug}/docs`}
      />
      <div className="px-5 pb-24 pt-4">
        <DocForm
          tripSlug={slug}
          mode={{ kind: "upload", action: bound }}
          submitLabel="Загрузить"
          backHref={`/trips/${slug}/docs`}
        />
      </div>
    </>
  );
}
