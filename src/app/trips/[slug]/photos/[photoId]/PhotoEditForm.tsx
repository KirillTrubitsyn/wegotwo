"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import type { PhotoActionState } from "../actions";

type DayOption = { id: string; label: string };

type Props = {
  action: (
    prev: PhotoActionState,
    fd: FormData
  ) => Promise<PhotoActionState>;
  initial: { caption: string; day_id: string | null };
  dayOptions: DayOption[];
  backHref: string;
};

const empty: PhotoActionState = { ok: true };

export default function PhotoEditForm({
  action,
  initial,
  dayOptions,
  backHref,
}: Props) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, empty);

  const formErr = !state.ok ? state.form : undefined;
  const dayErr = !state.ok ? state.fields?.day_id : undefined;

  return (
    <form action={formAction} className="space-y-4">
      {formErr && (
        <div className="bg-red-lt border border-accent/20 text-accent rounded-btn px-3 py-2 text-[13px]">
          {formErr}
        </div>
      )}
      {state.ok && state !== empty && (
        <div className="bg-green-lt border border-green/30 text-green rounded-btn px-3 py-2 text-[13px]">
          Сохранено
        </div>
      )}

      <div>
        <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
          Подпись
        </label>
        <input
          name="caption"
          defaultValue={initial.caption}
          maxLength={300}
          placeholder="Необязательно"
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-[11px] uppercase tracking-[0.5px] text-text-sec font-semibold mb-1">
          День
        </label>
        <select
          name="day_id"
          defaultValue={initial.day_id ?? ""}
          className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none"
        >
          <option value="">Без даты</option>
          {dayOptions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {dayErr && <div className="text-[12px] text-accent mt-1">{dayErr}</div>}
      </div>

      <div className="flex gap-3 pt-1">
        <button
          type="button"
          onClick={() => router.push(backHref)}
          className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[12px] text-[14px] font-medium text-text-main active:bg-bg-surface"
        >
          Назад
        </button>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-text-main text-white rounded-btn py-[12px] text-[14px] font-medium active:opacity-85 disabled:opacity-50"
        >
          {pending ? "Сохраняем…" : "Сохранить"}
        </button>
      </div>
    </form>
  );
}
