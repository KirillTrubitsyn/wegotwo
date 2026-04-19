import { notFound, redirect } from "next/navigation";
import { format, parseISO } from "date-fns";
import { ru } from "date-fns/locale";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import DocForm from "../DocForm";
import {
  updateDocumentAction,
  deleteDocumentAction,
  type DocActionState,
} from "../actions";
import PdfPreview from "../PdfPreview";
import IngestPanel from "./IngestPanel";
import { createAdminClient } from "@/lib/supabase/admin";
import { signedDocUrl, signedDocDownloadUrl } from "@/lib/docs/storage";
import { extForMime } from "@/lib/docs/labels";
import {
  DOC_KIND_LABELS,
  formatBytes,
  labelForKind,
} from "@/lib/docs/labels";

export const dynamic = "force-dynamic";

type Trip = { id: string; slug: string; title: string };

type IngestStatus =
  | "pending"
  | "needs_review"
  | "parsed"
  | "failed"
  | "skipped"
  | null;

type DocRow = {
  id: string;
  kind: string;
  title: string;
  storage_path: string;
  size_bytes: number | string | null;
  mime: string | null;
  created_at: string;
  uploaded_by_username: string | null;
  parsed_status: IngestStatus;
  parsed_fields: unknown;
};

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0;
  return typeof v === "string" ? Number(v) : v;
}

export default async function DocDetailPage({
  params,
}: {
  params: Promise<{ slug: string; docId: string }>;
}) {
  const { slug, docId } = await params;

  const admin = createAdminClient();
  const { data: tripData } = await admin
    .from("trips")
    .select("id,slug,title")
    .eq("slug", slug)
    .maybeSingle();
  if (!tripData) notFound();
  const trip = tripData as Trip;

  const { data: docData } = await admin
    .from("documents")
    .select(
      "id,kind,title,storage_path,size_bytes,mime,created_at,uploaded_by_username,parsed_status,parsed_fields"
    )
    .eq("id", docId)
    .eq("trip_id", trip.id)
    .maybeSingle();
  if (!docData) notFound();
  const doc = docData as DocRow;

  // Resolve a link to the row created from this document, if any.
  let linkedRowUrl: string | null = null;
  if (doc.parsed_status === "parsed") {
    const { data: fl } = await admin
      .from("flights")
      .select("id")
      .eq("trip_id", trip.id)
      .eq("document_id", doc.id)
      .maybeSingle();
    if ((fl as { id: string } | null)?.id) {
      linkedRowUrl = `/trips/${slug}`; // flights live on overview for now
    }
    if (!linkedRowUrl) {
      const { data: st } = await admin
        .from("stays")
        .select("id,destination_id")
        .eq("trip_id", trip.id)
        .eq("document_id", doc.id)
        .maybeSingle();
      const stay = st as
        | { id: string; destination_id: string | null }
        | null;
      if (stay?.destination_id) {
        linkedRowUrl = `/trips/${slug}/destinations/${stay.destination_id}`;
      }
    }
    if (!linkedRowUrl) {
      const { data: ex } = await admin
        .from("expenses")
        .select("id")
        .eq("trip_id", trip.id)
        .eq("document_id", doc.id)
        .maybeSingle();
      if ((ex as { id: string } | null)?.id) {
        linkedRowUrl = `/trips/${slug}/budget/${(ex as { id: string }).id}`;
      }
    }
  }

  const url = await signedDocUrl(admin, doc.storage_path);
  // Filename for Content-Disposition — fall back to a sane default when
  // the title has no extension.
  const ext = extForMime(doc.mime ?? "", "bin");
  const safeBase = (doc.title || "document").replace(/[\\/:*?"<>|]+/g, "_");
  const downloadName = /\.[a-z0-9]{2,5}$/i.test(safeBase)
    ? safeBase
    : `${safeBase}.${ext}`;
  const downloadUrl = await signedDocDownloadUrl(
    admin,
    doc.storage_path,
    downloadName
  );
  const isPdf = doc.mime === "application/pdf";
  const isImage = (doc.mime ?? "").startsWith("image/");
  const label = labelForKind(doc.kind);

  const bound = async (
    prev: DocActionState,
    formData: FormData
  ): Promise<DocActionState> => {
    "use server";
    return updateDocumentAction(slug, docId, prev, formData);
  };

  return (
    <>
      <OfflineBanner />
      <Header
        title={label.label}
        subtitle={trip.title}
        back={`/trips/${slug}/docs`}
      />
      <div className="px-5 pb-24 pt-4 space-y-5">
        {/* Meta card */}
        <div className="bg-white rounded-card shadow-card p-4 space-y-1">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-bg-surface flex items-center justify-center text-[16px]">
              {label.icon}
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-text-main truncate">
                {doc.title}
              </div>
              <div className="text-[12px] text-text-sec">
                {format(parseISO(doc.created_at), "d MMMM yyyy", {
                  locale: ru,
                })}
                {doc.uploaded_by_username
                  ? ` · ${
                      doc.uploaded_by_username === "kirill"
                        ? "Кирилл"
                        : doc.uploaded_by_username === "marina"
                        ? "Марина"
                        : doc.uploaded_by_username
                    }`
                  : ""}
                {toNum(doc.size_bytes) > 0
                  ? ` · ${formatBytes(toNum(doc.size_bytes))}`
                  : ""}
              </div>
            </div>
          </div>
        </div>

        {/* Preview */}
        {url ? (
          isPdf ? (
            <PdfPreview url={url} />
          ) : isImage ? (
            <div className="bg-white rounded-card shadow-card overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={doc.title}
                className="w-full h-auto block"
              />
            </div>
          ) : (
            <div className="bg-white rounded-card shadow-card p-5 text-[13px] text-text-sec">
              Превью недоступно для этого типа файла.
            </div>
          )
        ) : (
          <div className="bg-white rounded-card shadow-card p-5 text-[13px] text-accent">
            Не удалось получить ссылку на файл.
          </div>
        )}

        {url && (
          <div className="grid grid-cols-2 gap-2">
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="block bg-white border border-black/[0.08] rounded-btn py-[12px] text-center text-[14px] font-medium text-text-main active:bg-bg-surface"
            >
              Открыть
            </a>
            {downloadUrl && (
              <a
                href={downloadUrl}
                download={downloadName}
                className="block bg-text-main text-white rounded-btn py-[12px] text-center text-[14px] font-medium active:opacity-85"
              >
                Скачать оригинал
              </a>
            )}
          </div>
        )}

        {/* AI ingest */}
        <IngestPanel
          slug={slug}
          docId={doc.id}
          status={doc.parsed_status}
          parsedFields={doc.parsed_fields}
          linkedRowUrl={linkedRowUrl}
        />

        {/* Edit meta */}
        <section className="bg-white rounded-card shadow-card p-5 space-y-4">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
            Изменить
          </div>
          <DocForm
            tripSlug={slug}
            mode={{
              kind: "edit",
              action: bound,
              initial: {
                title: doc.title,
                kind: doc.kind in DOC_KIND_LABELS ? doc.kind : "other",
              },
            }}
            submitLabel="Сохранить"
            backHref={`/trips/${slug}/docs`}
          />
        </section>

        {/* Delete */}
        <form
          action={async () => {
            "use server";
            await deleteDocumentAction(slug, docId);
            redirect(`/trips/${slug}/docs`);
          }}
        >
          <button
            type="submit"
            className="w-full bg-white border border-accent/20 text-accent rounded-btn py-[12px] text-[14px] font-medium active:bg-red-lt"
          >
            Удалить документ
          </button>
        </form>
      </div>
    </>
  );
}
