import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import PhotoEditForm from "./PhotoEditForm";
import {
  updatePhotoAction,
  deletePhotoAction,
  setCoverPhotoAction,
  type PhotoActionState,
} from "../actions";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PHOTOS_BUCKET = "photos";

type Trip = {
  id: string;
  slug: string;
  title: string;
  cover_photo_path: string | null;
};

type DayRow = { id: string; date: string };

type PhotoRow = {
  id: string;
  storage_path: string;
  thumbnail_path: string | null;
  taken_at: string | null;
  caption: string | null;
  day_id: string | null;
  lat: number | null;
  lon: number | null;
  uploaded_by_username: string | null;
};

export default async function PhotoDetailPage({
  params,
}: {
  params: Promise<{ slug: string; photoId: string }>;
}) {
  const { slug, photoId } = await params;
  const admin = createAdminClient();

  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title,cover_photo_path")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: photoData } = await admin
    .from("photos")
    .select(
      "id,storage_path,thumbnail_path,taken_at,caption,day_id,lat,lon,uploaded_by_username"
    )
    .eq("id", photoId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!photoData) notFound();
  const photo = photoData as PhotoRow;

  const { data: dayData } = await admin
    .from("days")
    .select("id,date")
    .eq("trip_id", trip.id)
    .order("date", { ascending: true });
  const days = (dayData ?? []) as DayRow[];

  const { data: signed } = await admin.storage
    .from(PHOTOS_BUCKET)
    .createSignedUrl(photo.storage_path, 60 * 60);
  const url = signed?.signedUrl ?? null;

  const bound = async (
    prev: PhotoActionState,
    formData: FormData
  ): Promise<PhotoActionState> => {
    "use server";
    return updatePhotoAction(slug, photoId, prev, formData);
  };

  const dayOptions = days.map((d) => ({
    id: d.id,
    label: format(parseISO(d.date), "EEE, d MMMM", { locale: ru }),
  }));

  const isCover =
    trip.cover_photo_path != null &&
    trip.cover_photo_path === photo.storage_path;

  return (
    <>
      <OfflineBanner />
      <Header
        title="Фото"
        subtitle={trip.title}
        back={`/trips/${slug}/photos`}
      />
      <div className="px-5 pb-24 pt-4 space-y-5">
        <div className="bg-white rounded-card shadow-card overflow-hidden">
          {url ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={url}
              alt={photo.caption ?? ""}
              className="w-full h-auto block bg-black/[0.02]"
            />
          ) : (
            <div className="aspect-video flex items-center justify-center text-[13px] text-accent">
              Не удалось получить изображение.
            </div>
          )}
          <div className="p-3 text-[12px] text-text-sec">
            {photo.taken_at
              ? format(new Date(photo.taken_at), "d MMMM yyyy, HH:mm", {
                  locale: ru,
                })
              : "Дата снимка неизвестна"}
            {photo.lat != null && photo.lon != null
              ? ` · ${photo.lat.toFixed(4)}, ${photo.lon.toFixed(4)}`
              : ""}
            {photo.uploaded_by_username
              ? ` · ${
                  photo.uploaded_by_username === "kirill"
                    ? "Кирилл"
                    : photo.uploaded_by_username === "marina"
                    ? "Марина"
                    : photo.uploaded_by_username
                }`
              : ""}
          </div>
        </div>

        <section className="bg-white rounded-card shadow-card p-5">
          <PhotoEditForm
            action={bound}
            initial={{
              caption: photo.caption ?? "",
              day_id: photo.day_id ?? null,
            }}
            dayOptions={dayOptions}
            backHref={`/trips/${slug}/photos`}
          />
        </section>

        <form
          action={async () => {
            "use server";
            await setCoverPhotoAction(slug, isCover ? null : photoId);
          }}
        >
          <button
            type="submit"
            className={
              isCover
                ? "w-full bg-white border border-black/10 text-text-main rounded-btn py-[12px] text-[14px] font-medium active:bg-bg-surface"
                : "w-full bg-blue-lt text-blue rounded-btn py-[12px] text-[14px] font-semibold active:opacity-85"
            }
          >
            {isCover ? "Убрать с обложки" : "Сделать обложкой поездки"}
          </button>
        </form>

        <form
          action={async () => {
            "use server";
            await deletePhotoAction(slug, photoId);
            redirect(`/trips/${slug}/photos`);
          }}
        >
          <button
            type="submit"
            className="w-full bg-white border border-accent/20 text-accent rounded-btn py-[12px] text-[14px] font-medium active:bg-red-lt"
          >
            Удалить фото
          </button>
        </form>
      </div>
    </>
  );
}
