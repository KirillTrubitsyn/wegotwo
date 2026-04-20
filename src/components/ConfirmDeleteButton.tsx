"use client";

import { useRef, useState, useTransition } from "react";
import { verifyAccessCodeAction } from "@/app/actions/verify-code";

type Props = {
  /** Server action that performs the actual deletion. */
  perform: () => Promise<unknown>;
  /** What appears on the trigger button. */
  label?: string;
  /** Short explanation shown inside the modal. */
  confirmText?: string;
  /** Called after successful perform() — typically `router.refresh()`. */
  onDone?: () => void;
  /** Tailwind className for the trigger button. */
  className?: string;
  /** Optional icon-only mode (renders children inside trigger). */
  children?: React.ReactNode;
};

/**
 * Кнопка-подтверждение удаления. Нажатие открывает модалку, где
 * юзер вводит свой код доступа (тот самый, что на /unlock).
 * Только после успешной верификации вызывается `perform`.
 *
 * Используется:
 *   • в меню «три точки» события таймлайна (Удалить);
 *   • в футере деталей поездки / фото / документа / расхода.
 */
export default function ConfirmDeleteButton({
  perform,
  label = "Удалить",
  confirmText = "Подтвердите удаление — введите код доступа учётной записи.",
  onDone,
  className,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => {
    if (pending) return;
    setOpen(false);
    setCode("");
    setErr(null);
  };

  const submit = () => {
    startTransition(async () => {
      setErr(null);
      const ok = await verifyAccessCodeAction(code);
      if (!ok) {
        setErr("Неверный код");
        inputRef.current?.focus();
        return;
      }
      try {
        await perform();
        setOpen(false);
        setCode("");
        onDone?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Не удалось удалить");
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setTimeout(() => inputRef.current?.focus(), 50);
        }}
        className={
          className ??
          "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-accent/20 text-accent hover:bg-red-lt"
        }
      >
        {children ?? label}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4"
          onClick={close}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[360px] bg-white rounded-card shadow-card p-5 space-y-4"
          >
            <div>
              <div className="text-[15px] font-semibold text-text-main">
                {label}
              </div>
              <div className="text-[12px] text-text-sec mt-[4px] leading-[1.4]">
                {confirmText}
              </div>
            </div>
            <div>
              <input
                ref={inputRef}
                type="password"
                autoComplete="current-password"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submit();
                  if (e.key === "Escape") close();
                }}
                placeholder="Код доступа"
                className="w-full bg-bg-surface rounded-btn px-3 py-[10px] text-[14px] text-text-main border border-transparent focus:border-blue focus:bg-white focus:outline-none tnum"
                disabled={pending}
              />
              {err && (
                <div className="text-[12px] text-accent mt-[6px]">{err}</div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={close}
                disabled={pending}
                className="flex-1 bg-white border border-black/[0.08] rounded-btn py-[10px] text-[13px] font-medium text-text-main active:bg-bg-surface disabled:opacity-60"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || !code.trim()}
                className="flex-1 bg-accent text-white rounded-btn py-[10px] text-[13px] font-semibold active:opacity-85 disabled:opacity-60"
              >
                {pending ? "Удаляем…" : label}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
