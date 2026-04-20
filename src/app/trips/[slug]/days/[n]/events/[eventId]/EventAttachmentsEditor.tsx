"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type Attachment = {
  document_id: string;
  label: string | null;
  title: string | null;
};

type AvailableDoc = {
  id: string;
  title: string | null;
  kind: string | null;
};

type Props = {
  attachments: Attachment[];
  availableDocs: AvailableDoc[];
  addAttachment: (documentId: string, label: string | null) => Promise<void>;
  removeAttachment: (documentId: string) => Promise<void>;
};

export default function EventAttachmentsEditor({
  attachments,
  availableDocs,
  addAttachment,
  removeAttachment,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedDocId, setSelectedDocId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const attachedIds = new Set(attachments.map((a) => a.document_id));
  const unattached = availableDocs.filter((d) => !attachedIds.has(d.id));

  function handleAdd() {
    if (!selectedDocId) return;
    const doc = availableDocs.find((d) => d.id === selectedDocId);
    const label = doc?.title ?? null;
    setError(null);
    startTransition(async () => {
      try {
        await addAttachment(selectedDocId, label);
        setSelectedDocId("");
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось прикрепить");
      }
    });
  }

  function handleRemove(documentId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeAttachment(documentId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось убрать");
      }
    });
  }

  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-2">
        Документы / билеты
      </label>
      {error && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px] mb-2">
          {error}
        </div>
      )}
      <div className="space-y-2">
        {attachments.length === 0 ? (
          <div className="text-[12px] text-text-sec">
            Нет прикреплённых документов.
          </div>
        ) : (
          attachments.map((a) => (
            <div
              key={a.document_id}
              className="flex items-center justify-between gap-2 bg-bg-surface rounded-btn px-3 py-[9px]"
            >
              <span className="text-[13px] text-text-main truncate">
                🎫 {a.label ?? a.title ?? "Документ"}
              </span>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleRemove(a.document_id)}
                className="shrink-0 text-[12px] text-accent disabled:opacity-50"
              >
                Убрать
              </button>
            </div>
          ))
        )}
        {unattached.length > 0 ? (
          <div className="flex gap-2">
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="flex-1 bg-bg-surface rounded-btn px-3 py-[10px] text-[13px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
            >
              <option value="">— выбрать документ —</option>
              {unattached.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title ?? d.id.slice(0, 8)}
                  {d.kind ? ` · ${d.kind}` : ""}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedDocId || pending}
              onClick={handleAdd}
              className="shrink-0 bg-blue text-white rounded-btn px-4 py-[10px] text-[13px] font-medium disabled:opacity-40"
            >
              {pending ? "…" : "Добавить"}
            </button>
          </div>
        ) : (
          availableDocs.length === 0 && (
            <div className="text-[12px] text-text-sec">
              У поездки нет документов — загрузите PDF в разделе «Документы».
            </div>
          )
        )}
      </div>
    </div>
  );
}
