import Link from "next/link";
import Flag from "./Flag";

export type CityTab = {
  id: string;
  name: string;
  flagCode: string | null;
  type: "stay" | "home" | "transit" | string | null;
  sortOrder: number | null;
  dateFrom: string | null;
};

/**
 * Horizontal scrollable list of city tabs for a trip. Rules:
 * - `type in ('stay','home')` only.
 * - All `home` destinations are collapsed into a single "Домой" tab
 *   that points to the last home destination (return leg).
 * - `activeId === null` → no tab is highlighted (used on overview).
 */
export default function CityTabs({
  slug,
  tabs: rawTabs,
  activeId,
}: {
  slug: string;
  tabs: CityTab[];
  activeId: string | null;
}) {
  // Filter + collapse home duplicates.
  const tabs: CityTab[] = [];
  for (const t of rawTabs) {
    if (t.type === "home") continue;
    if (t.type !== "stay") continue;
    tabs.push(t);
  }
  const homeBack = [...rawTabs]
    .reverse()
    .find((t) => t.type === "home");
  if (homeBack) tabs.push({ ...homeBack, name: "Домой" });

  if (tabs.length === 0) return null;

  return (
    <div className="flex gap-[8px] overflow-x-auto -mx-5 px-5 pb-1 no-scrollbar">
      {tabs.map((t) => {
        const active = t.id === activeId;
        return (
          <Link
            key={t.id}
            href={`/trips/${slug}/destinations/${t.id}`}
            className={`flex items-center gap-[6px] px-4 py-[8px] rounded-badge text-[13px] font-medium whitespace-nowrap border transition-colors shrink-0 ${
              active
                ? "bg-accent text-white border-accent"
                : "bg-white text-text-main border-black/10 hover:bg-bg-surface"
            }`}
          >
            <Flag code={t.flagCode} size="sm" />
            <span>{t.name}</span>
          </Link>
        );
      })}
    </div>
  );
}
