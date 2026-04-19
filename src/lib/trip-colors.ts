/**
 * Design palette keys usable as trip accent color.
 * Mirrors the colors defined in tailwind.config.ts.
 */
export type TripColor = "blue" | "gold" | "accent" | "green" | "purple";

export const TRIP_COLORS: TripColor[] = [
  "blue",
  "gold",
  "accent",
  "green",
  "purple",
];

type Swatch = {
  bg: string;
  text: string;
  solid: string;
  light: string;
  gradientFrom: string;
  gradientTo: string;
  label: string;
};

export const TRIP_COLOR_MAP: Record<TripColor, Swatch> = {
  blue: {
    bg: "bg-blue",
    text: "text-blue",
    solid: "bg-blue text-white",
    light: "bg-blue-lt text-blue",
    gradientFrom: "from-blue",
    gradientTo: "to-[#5B9CFF]",
    label: "Синий",
  },
  gold: {
    bg: "bg-gold",
    text: "text-gold",
    solid: "bg-gold text-white",
    light: "bg-gold-lt text-gold",
    gradientFrom: "from-gold",
    gradientTo: "to-[#F2B84B]",
    label: "Золотой",
  },
  accent: {
    bg: "bg-accent",
    text: "text-accent",
    solid: "bg-accent text-white",
    light: "bg-red-lt text-accent",
    gradientFrom: "from-accent",
    gradientTo: "to-[#FF6B6B]",
    label: "Красный",
  },
  green: {
    bg: "bg-green",
    text: "text-green",
    solid: "bg-green text-white",
    light: "bg-green-lt text-green",
    gradientFrom: "from-green",
    gradientTo: "to-[#5BD082]",
    label: "Зелёный",
  },
  purple: {
    bg: "bg-purple",
    text: "text-purple",
    solid: "bg-purple text-white",
    light: "bg-purple-lt text-purple",
    gradientFrom: "from-purple",
    gradientTo: "to-[#B59CFF]",
    label: "Фиолетовый",
  },
};

export function swatch(color: string | null | undefined): Swatch {
  const key = (color ?? "blue") as TripColor;
  return TRIP_COLOR_MAP[key] ?? TRIP_COLOR_MAP.blue;
}
