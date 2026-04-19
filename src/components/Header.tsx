export default function Header({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="px-5 pt-[max(16px,env(safe-area-inset-top))] pb-3">
      <h1 className="font-semibold text-[28px] tracking-tight leading-tight text-text-main">
        {title}
      </h1>
      {subtitle && (
        <p className="text-text-sec text-[13px] mt-1">{subtitle}</p>
      )}
    </header>
  );
}
