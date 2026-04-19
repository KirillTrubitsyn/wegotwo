type Kind = "info" | "warn" | "alert" | "success";

const STYLES: Record<Kind, { box: string; text: string; icon: string }> = {
  info: {
    box: "bg-blue-lt border-blue/15",
    text: "text-blue",
    icon: "ℹ️",
  },
  warn: {
    box: "bg-gold-lt border-gold/15",
    text: "text-gold",
    icon: "⚠️",
  },
  alert: {
    box: "bg-red-lt border-accent/15",
    text: "text-accent",
    icon: "⚠️",
  },
  success: {
    box: "bg-green-lt border-green/15",
    text: "text-green",
    icon: "✓",
  },
};

type Props = {
  text: string;
  kind?: Kind;
  icon?: string;
};

export default function AlertCard({ text, kind = "alert", icon }: Props) {
  const s = STYLES[kind];
  return (
    <div
      className={`${s.box} border rounded-btn px-[16px] py-[14px] flex gap-[10px] items-start`}
    >
      <span className="text-[16px] leading-[1.5] flex-shrink-0">
        {icon ?? s.icon}
      </span>
      <span className={`${s.text} text-[13px] leading-[1.5] font-medium`}>
        {text}
      </span>
    </div>
  );
}
