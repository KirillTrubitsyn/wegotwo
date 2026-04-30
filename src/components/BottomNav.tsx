import Link from "next/link";

const ICONS = {
  home: "🗺",
  days: "📅",
  docs: "📋",
  photos: "🖼",
  budget: "💳",
};

/**
 * Идентификатор активной вкладки нижнего навбара.
 * Передаётся явным prop'ом из server-компонента страницы — это
 * позволяет обойтись без `usePathname()` (нужен client) и без
 * `headers()` (opt-in dynamic rendering, ломал ISR на trip-страницах).
 */
export type BottomNavActive =
  | "overview"
  | "days"
  | "docs"
  | "photos"
  | "budget";

type Item = {
  id: BottomNavActive;
  label: string;
  icon: keyof typeof ICONS;
  href: string;
};

function buildItems(slug: string): Item[] {
  const base = `/trips/${slug}`;
  return [
    { id: "overview", label: "Обзор", icon: "home", href: base },
    { id: "days", label: "Дни", icon: "days", href: `${base}/days` },
    { id: "docs", label: "Документы", icon: "docs", href: `${base}/docs` },
    { id: "photos", label: "Фото", icon: "photos", href: `${base}/photos` },
    { id: "budget", label: "Бюджет", icon: "budget", href: `${base}/budget` },
  ];
}

/**
 * Нижний навбар поездки.
 *
 * Чисто render-only server component: нет ни хуков, ни state, ни
 * server-side request API (`headers()` / `cookies()`), которые бы
 * opt-in'или dynamic rendering. Активная вкладка приходит из
 * вызывающей страницы — каждая trip-страница точно знает, в каком
 * разделе она находится. Это сохраняет ISR (`revalidate=30`) на
 * `/trips/[slug]`, `/days/[n]`, `/budget` и т.д.
 */
export default function BottomNav({
  slug,
  active,
}: {
  slug: string;
  active: BottomNavActive;
}) {
  const items = buildItems(slug);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-white/[0.92] backdrop-blur-[24px] border-t border-black/[0.06] flex justify-around py-[6px] pb-[max(6px,env(safe-area-inset-bottom))] z-[200]">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-[2px] px-3 py-[6px] rounded-btn transition-colors duration-150 ${
              isActive
                ? "text-accent"
                : "text-text-mut hover:text-text-sec"
            }`}
          >
            <span className="text-[20px] leading-none">{ICONS[item.icon]}</span>
            <span className="text-[10px] font-semibold tracking-[0.3px]">
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
