/**
 * Design palette keys usable as trip accent color.
 * Mirrors the colors defined in tailwind.config.ts.
 */
export type TripColor =
  | "blue"
  | "teal"
  | "green"
  | "gold"
  | "orange"
  | "accent"
  | "pink"
  | "purple";

// Rainbow order: cool blues → greens → warm yellows → reds → purples
export const TRIP_COLORS: TripColor[] = [
  "blue",
  "teal",
  "green",
  "gold",
  "orange",
  "accent",
  "pink",
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

// Bi-chromatic gradients: each color blends into a harmonious neighbour,
// giving a natural two-tone palette feel from a single selection.
export const TRIP_COLOR_MAP: Record<TripColor, Swatch> = {
  blue: {
    bg: "bg-blue",
    text: "text-blue",
    solid: "bg-blue text-white",
    light: "bg-blue-lt text-blue",
    gradientFrom: "from-blue",
    gradientTo: "to-teal",
    label: "Синий",
  },
  teal: {
    bg: "bg-teal",
    text: "text-teal",
    solid: "bg-teal text-white",
    light: "bg-teal-lt text-teal",
    gradientFrom: "from-teal",
    gradientTo: "to-blue",
    label: "Бирюзовый",
  },
  green: {
    bg: "bg-green",
    text: "text-green",
    solid: "bg-green text-white",
    light: "bg-green-lt text-green",
    gradientFrom: "from-green",
    gradientTo: "to-teal",
    label: "Зелёный",
  },
  gold: {
    bg: "bg-gold",
    text: "text-gold",
    solid: "bg-gold text-white",
    light: "bg-gold-lt text-gold",
    gradientFrom: "from-gold",
    gradientTo: "to-orange",
    label: "Золотой",
  },
  orange: {
    bg: "bg-orange",
    text: "text-orange",
    solid: "bg-orange text-white",
    light: "bg-orange-lt text-orange",
    gradientFrom: "from-orange",
    gradientTo: "to-gold",
    label: "Оранжевый",
  },
  accent: {
    bg: "bg-accent",
    text: "text-accent",
    solid: "bg-accent text-white",
    light: "bg-red-lt text-accent",
    gradientFrom: "from-accent",
    gradientTo: "to-pink",
    label: "Красный",
  },
  pink: {
    bg: "bg-pink",
    text: "text-pink",
    solid: "bg-pink text-white",
    light: "bg-pink-lt text-pink",
    gradientFrom: "from-pink",
    gradientTo: "to-purple",
    label: "Розовый",
  },
  purple: {
    bg: "bg-purple",
    text: "text-purple",
    solid: "bg-purple text-white",
    light: "bg-purple-lt text-purple",
    gradientFrom: "from-purple",
    gradientTo: "to-pink",
    label: "Фиолетовый",
  },
};

export function swatch(color: string | null | undefined): Swatch {
  const key = (color ?? "blue") as TripColor;
  return TRIP_COLOR_MAP[key] ?? TRIP_COLOR_MAP.blue;
}
