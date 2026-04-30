"use client";

import dynamic from "next/dynamic";
import { useState } from "react";

// Сама модалка с input + verifyAccessCode подгружается лениво:
// триггер удаления остаётся дешёвым, а тяжёлый код (server action,
// useTransition, фокус-менеджмент) появляется только при первом
// клике. На read-страницах диалог удаления вообще не нужен.
const ConfirmDeleteModal = dynamic(
  () => import("@/components/ConfirmDeleteModal"),
  { ssr: false }
);

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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          className ??
          "inline-flex items-center gap-[5px] px-[14px] py-[7px] rounded-badge text-[12px] font-medium border border-accent/20 text-accent hover:bg-red-lt"
        }
      >
        {children ?? label}
      </button>

      <ConfirmDeleteModal
        open={open}
        onClose={() => setOpen(false)}
        perform={perform}
        label={label}
        confirmText={confirmText}
        onDone={onDone}
      />
    </>
  );
}
