/**
 * Раскрывающийся блок «Подробнее» под карточкой события.
 *
 * Используется нативный `<details>` — встроенный в браузер
 * аккордеон, доступный с клавиатуры и корректно работающий без
 * JavaScript. Стилизация — через Tailwind.
 *
 * Это server component: ни хуков, ни state, ни обработчиков
 * событий нет, и `<details>` тоже не требует JS. Раньше файл был
 * помечен `"use client"` без причины — это тащило компонент в
 * client bundle на каждой странице дня.
 *
 * Текст рендерится как plain-text с сохранением переносов
 * (whitespace-pre-line). Если в будущем понадобится markdown —
 * подключим remark / react-markdown точечно.
 */
export default function EventDescription({
  text,
}: {
  text: string | null | undefined;
}) {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  return (
    <details className="mt-2 rounded-card bg-bg-surface border border-black/[0.06] group">
      <summary className="cursor-pointer list-none px-3 py-[9px] text-[12px] font-medium text-text-sec select-none flex items-center justify-between">
        <span>Подробнее</span>
        <span className="text-[11px] transition-transform group-open:rotate-180">
          ▾
        </span>
      </summary>
      <div className="px-3 pb-3 pt-1 text-[13px] text-text-main leading-[1.55] whitespace-pre-line">
        {trimmed}
      </div>
    </details>
  );
}
