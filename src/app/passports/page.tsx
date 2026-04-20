import Link from "next/link";
import Header from "@/components/Header";
import OfflineBanner from "@/components/OfflineBanner";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  signedDocUrl,
  signedDocDownloadUrl,
} from "@/lib/docs/storage";
import { COMMON_DOCS, type CommonDoc } from "@/lib/common-docs/catalog";

export const dynamic = "force-dynamic";

type DocWithUrls = CommonDoc & {
  viewUrl: string | null;
  downloadUrl: string | null;
};

async function resolveUrls(): Promise<DocWithUrls[]> {
  const admin = createAdminClient();
  return Promise.all(
    COMMON_DOCS.map(async (doc) => {
      const [viewUrl, downloadUrl] = await Promise.all([
        signedDocUrl(admin, doc.storagePath, 60 * 60),
        signedDocDownloadUrl(
          admin,
          doc.storagePath,
          doc.downloadFilename,
          60 * 60
        ),
      ]);
      return { ...doc, viewUrl, downloadUrl };
    })
  );
}

export default async function PassportsPage() {
  const docs = await resolveUrls();
  const missing = docs.some((d) => !d.viewUrl);

  return (
    <>
      <OfflineBanner />
      <Header title="Паспорта" back="/" />

      <div className="px-5 pb-24 pt-4 space-y-3">
        <p className="text-[13px] text-text-sec leading-relaxed">
          Загранпаспорта для любой поездки. Файлы хранятся в приватном
          Supabase&nbsp;Storage, ссылки действительны один час.
        </p>

        {missing && (
          <div className="rounded-card bg-gold-lt border border-gold/30 text-text-main p-4 text-[13px] leading-relaxed">
            Не удалось подписать ссылку хотя бы на один документ. Проверьте,
            что <code className="font-mono text-[12px]">/api/admin/seed/common-docs</code>{" "}
            был вызван после деплоя.
          </div>
        )}

        <div className="space-y-3">
          {docs.map((doc) => (
            <PassportCard key={doc.id} doc={doc} />
          ))}
        </div>
      </div>
    </>
  );
}

function PassportCard({ doc }: { doc: DocWithUrls }) {
  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="p-4 flex items-center gap-3">
        <div className="w-[48px] h-[48px] rounded-[12px] bg-blue-lt flex items-center justify-center flex-shrink-0">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <rect
              x="4"
              y="3"
              width="16"
              height="18"
              rx="2"
              stroke="#3478F6"
              strokeWidth="1.8"
            />
            <circle cx="12" cy="11" r="2.5" stroke="#3478F6" strokeWidth="1.6" />
            <path
              d="M8 17c.8-1.6 2.3-2.5 4-2.5s3.2.9 4 2.5"
              stroke="#3478F6"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold text-text-main">
            {doc.owner}
          </div>
          <div className="text-[12px] text-text-sec mt-[2px] tabular-nums">
            {doc.title} · № {doc.number}
          </div>
        </div>
      </div>

      <div className="border-t border-black/[0.06] grid grid-cols-2">
        {doc.viewUrl ? (
          <a
            href={doc.viewUrl}
            target="_blank"
            rel="noreferrer"
            className="py-[12px] text-center text-[14px] font-medium text-blue active:bg-bg-surface"
          >
            Открыть
          </a>
        ) : (
          <span className="py-[12px] text-center text-[14px] font-medium text-text-mut">
            Файл недоступен
          </span>
        )}
        <Link
          href={doc.downloadUrl ?? "#"}
          className={`py-[12px] text-center text-[14px] font-medium border-l border-black/[0.06] ${
            doc.downloadUrl
              ? "text-text-main active:bg-bg-surface"
              : "text-text-mut pointer-events-none"
          }`}
          prefetch={false}
        >
          Скачать
        </Link>
      </div>
    </div>
  );
}
