/**
 * Small country flag rendered via flagcdn.com CDN. Uses PNG because
 * Windows/Linux browsers do not compose regional-indicator emojis
 * into a flag glyph; a rasterized CDN flag renders identically
 * across platforms.
 *
 * `code` is the ISO 3166-1 alpha-2 two-letter country code (e.g. "fr",
 * "de", "ch"). Case-insensitive.
 */
type FlagSize = "sm" | "md" | "lg";

const WIDTH_PX: Record<FlagSize, number> = {
  sm: 20,
  md: 28,
  lg: 40,
};

// flagcdn serves pre-rendered widths: 20, 40, 80, 160, ...
const CDN_WIDTH: Record<FlagSize, number> = {
  sm: 40,
  md: 80,
  lg: 160,
};

export default function Flag({
  code,
  size = "sm",
  className = "",
}: {
  code: string | null | undefined;
  size?: FlagSize;
  className?: string;
}) {
  if (!code || code.length !== 2) return null;
  const c = code.toLowerCase();
  const w = WIDTH_PX[size];
  const cdnW = CDN_WIDTH[size];
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={`https://flagcdn.com/w${cdnW}/${c}.png`}
      srcSet={`https://flagcdn.com/w${cdnW * 2}/${c}.png 2x`}
      alt={c.toUpperCase()}
      width={w}
      height={Math.round((w * 3) / 4)}
      className={`inline-block rounded-[2px] shadow-[0_0_0_0.5px_rgba(0,0,0,0.08)] object-cover ${className}`}
      loading="lazy"
    />
  );
}
