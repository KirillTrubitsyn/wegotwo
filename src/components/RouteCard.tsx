import { swatch, type TripColor } from "@/lib/trip-colors";

type Props = {
  title: string;
  summary?: string | null;
  color?: TripColor | string | null;
};

export default function RouteCard({ title, summary, color }: Props) {
  const s = swatch(color);
  return (
    <div
      className={`relative overflow-hidden rounded-card p-[22px_20px] bg-gradient-to-br ${s.gradientFrom} ${s.gradientTo}`}
    >
      <div className="absolute -top-10 -right-10 w-[140px] h-[140px] bg-white/[0.08] rounded-full" />
      <div className="relative z-10 text-[20px] font-bold text-white leading-[1.35] tracking-[-0.3px] whitespace-pre-line">
        {title}
      </div>
      {summary && (
        <div className="relative z-10 text-[13px] text-white/85 mt-[10px]">
          {summary}
        </div>
      )}
    </div>
  );
}
