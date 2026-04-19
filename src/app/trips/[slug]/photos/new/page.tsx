import { notFound } from "next/navigation";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import PhotoUploader from "../PhotoUploader";
import {
  uploadPhotoAction,
  type PhotoActionState,
} from "../actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type Trip = { id: string; slug: string; title: string };

export default async function NewPhotoPage({
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
    prev: PhotoActionState,
    formData: FormData
  ): Promise<PhotoActionState> => {
    "use server";
    return uploadPhotoAction(slug, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title="Новое фото"
        subtitle={trip.title}
        back={`/trips/${slug}/photos`}
      />
      <div className="px-5 pb-24 pt-4">
        <PhotoUploader tripSlug={slug} action={bound} />
      </div>
    </>
  );
}
