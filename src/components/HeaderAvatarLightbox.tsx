"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

type Props = {
  open: boolean;
  onClose: () => void;
};

/**
 * Полноэкранный просмотр аватара K&M. Вынесен из Header в отдельный
 * lazy-chunk: portal + keydown listener подгружаются только когда
 * пользователь действительно тапает по аватару, а не на каждой
 * странице приложения.
 */
export default function HeaderAvatarLightbox({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[999] bg-black/90 backdrop-blur-md flex items-center justify-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-full bg-white/20 text-white hover:bg-white/30 transition-colors z-[1000]"
        style={{ marginTop: "env(safe-area-inset-top)" }}
        aria-label="Закрыть"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path
            d="M18 6L6 18M6 6l12 12"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </button>
      <div
        className="w-[90vw] max-w-[400px] rounded-[16px] overflow-hidden shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/photos/K&M.webp"
          alt="Кирилл и Марина"
          width={600}
          height={600}
          decoding="async"
          className="w-full h-auto block"
        />
      </div>
    </div>,
    document.body
  );
}
