import Link from "next/link";
import { swatch, type TripColor } from "@/lib/trip-colors";

type Props = {
  href?: string;
  dateLabel: string;
  title: string;
  detail?: string | null;
  badge?: string | null;
  /** Badge color key; defaults to the parent trip color. */
  badgeColor?: TripColor | string | null;
};

export default function DayCard({
  href,
  dateLabel,
  title,
  detail,
  badge,
  badgeColor,
}: Props) {
  const s = swatch(badgeColor);
  const body = (
    <div className="bg-white border border-black/[0.06] rounded-btn px-[18px] py-[16px] transition-all duration-200 hover:border-black/10 hover:shadow-card">
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] text-text-mut tracking-[0.3px] font-medium uppercase">
            {dateLabel}
          </div>
          <div className="text-[16px] font-semibold mt-[3px] tracking-[-0.2px] text-text-main truncate">
            {title}
          </div>
        </div>
        {badge && (
          <span
            className={`flex-shrink-0 px-[10px] py-[3px] rounded-badge text-[11px] font-semibold tracking-[0.2px] ${s.light}`}
          >
            {badge}
          </span>
        )}
      </div>
      {detail && (
        <div className="text-[13px] text-text-sec mt-[6px] leading-[1.4]">
          {detail}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {body}
      </Link>
    );
  }
  return body;
}
