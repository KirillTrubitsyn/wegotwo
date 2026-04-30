import { headers } from "next/headers";
import Link from "next/link";

const ICONS = {
  home: "🗺",
  days: "📅",
  docs: "📋",
  photos: "🖼",
  budget: "💳",
};

type Item = {
  label: string;
  icon: keyof typeof ICONS;
  href: string;
  match: (path: string) => boolean;
};

function buildItems(slug: string): Item[] {
  const base = `/trips/${slug}`;
  return [
    {
      label: "Обзор",
      icon: "home",
      href: base,
      match: (p) => p === base,
    },
    {
      label: "Дни",
      icon: "days",
      href: `${base}/days`,
      match: (p) => p.startsWith(`${base}/days`),
    },
    {
      label: "Документы",
      icon: "docs",
      href: `${base}/docs`,
      match: (p) => p.startsWith(`${base}/docs`),
    },
    {
      label: "Фото",
      icon: "photos",
      href: `${base}/photos`,
      match: (p) => p.startsWith(`${base}/photos`),
    },
    {
      label: "Бюджет",
      icon: "budget",
      href: `${base}/budget`,
      match: (p) => p.startsWith(`${base}/budget`),
    },
  ];
}

/**
 * Нижний навбар поездки. Был client-компонентом только ради
 * `usePathname()` — это тащило BottomNav в client bundle на каждой
 * странице поездки без какой-либо реальной интерактивности.
 *
 * Теперь это server component: pathname приходит из request headers,
 * которые middleware прокидывает (`x-wgt-pathname`). Активный таб
 * вычисляется на сервере, клиенту улетает уже готовый HTML.
 */
export default async function BottomNav({ slug }: { slug: string }) {
  const h = await headers();
  const pathname = h.get("x-wgt-pathname") ?? "";
  const items = buildItems(slug);

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-app bg-white/[0.92] backdrop-blur-[24px] border-t border-black/[0.06] flex justify-around py-[6px] pb-[max(6px,env(safe-area-inset-bottom))] z-[200]">
      {items.map((item) => {
        const active = item.match(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-[2px] px-3 py-[6px] rounded-btn transition-colors duration-150 ${
              active
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
