"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import type { DocActionState } from "./actions";
import { DOC_KIND_LABELS, UPLOADABLE_KINDS } from "@/lib/docs/labels";

type Mode =
  | {
      kind: "upload";
      action: (
        prev: DocActionState,
        fd: FormData
      ) => Promise<DocActionState>;
    }
  | {
      kind: "edit";
      action: (
        prev: DocActionState,
        fd: FormData
      ) => Promise<DocActionState>;
      initial: { title: string; kind: string };
    };

type Props = {
  tripSlug: string;
  mode: Mode;
  submitLabel: string;
  backHref: string;
};

const empty: DocActionState = { ok: true };

export default function DocForm({
  tripSlug: _tripSlug,
  mode,
  submitLabel,
  backHref,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(mode.action, empty);
  const [filename, setFilename] = useState<string>("");

  const fields = !state.ok ? state.fields ?? {} : {};
  const formErr = !state.ok ? state.form : undefined;

  const isEdit = mode.kind === "edit";
  const initialTitle = mode.kind === "edit" ? mode.initial.title : "";
  const initialKind = mode.kind === "edit" ? mode.initial.kind : "other";

  return (
    <form action={formAction} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      )}

      {!isEdit && (
        <Field label="Файл" error={fields.file}>
          <label className="block bg-bg-surface rounded-btn px-3 py-[14px] border border-dashed border-black/[0.12] text-center cursor-pointer active:bg-black/[0.04]">
            <input
              name="file"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp,image/heic,image/heif"
              required
              className="sr-only"
              onChange={(ev) => {
                const f = ev.currentTarget.files?.[0];
                setFilename(f?.name ?? "");
              }}
            />
            <span className="text-[14px] text-text-main font-medium">
              {filename || "Выбрать файл"}
            </span>
            <div className="text-[12px] text-text-sec mt-1">
              PDF, JPG, PNG, WebP, HEIC. До 25 МБ.
            </div>
          </label>
        </Field>
      )}

      <Field label="Название" error={fields.title}>
        <input
          name="title"
          type="text"
          required
          maxLength={160}
          defaultValue={initialTitle}
          placeholder="Например, Паспорт Кирилла"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </Field>

      <Field label="Категория" error={fields.kind}>
        <select
          name="kind"
          defaultValue={initialKind}
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        >
          {UPLOADABLE_KINDS.map((k) => (
            <option key={k} value={k}>
              {DOC_KIND_LABELS[k]?.icon} {DOC_KIND_LABELS[k]?.label}
            </option>
          ))}
        </select>
      </Field>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
        >
          Отмена
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-text-main text-white rounded-btn py-[12px] text-[14px] font-medium active:opacity-85 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
        {label}
      </label>
      {children}
      {error && <div className="text-[12px] text-accent mt-1">{error}</div>}
    </div>
  );
}
