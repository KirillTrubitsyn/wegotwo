/**
 * Design palette keys usable as trip accent color.
 * Mirrors the colors defined in tailwind.config.ts.
 */
export type TripColor =
  | "blue"
  | "gold"
  | "accent"
  | "green"
  | "purple"
  | "orange"
  | "teal"
  | "pink"
  | "indigo"
  | "sky";

export const TRIP_COLORS: TripColor[] = [
  "blue",
  "sky",
  "teal",
  "indigo",
  "purple",
  "pink",
  "accent",
  "orange",
  "gold",
  "green",
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

// Gradients are bi-chromatic: each color blends into a harmonious neighbour
// on the colour wheel, giving a natural "two-tone palette" feel.
export const TRIP_COLOR_MAP: Record<TripColor, Swatch> = {
  blue: {
    bg: "bg-blue",
    text: "text-blue",
    solid: "bg-blue text-white",
    light: "bg-blue-lt text-blue",
    gradientFrom: "from-blue",
    gradientTo: "to-sky",
    label: "Синий",
  },
  sky: {
    bg: "bg-sky",
    text: "text-sky",
    solid: "bg-sky text-white",
    light: "bg-sky-lt text-sky",
    gradientFrom: "from-sky",
    gradientTo: "to-indigo",
    label: "Голубой",
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
  indigo: {
    bg: "bg-indigo",
    text: "text-indigo",
    solid: "bg-indigo text-white",
    light: "bg-indigo-lt text-indigo",
    gradientFrom: "from-indigo",
    gradientTo: "to-teal",
    label: "Индиго",
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
  pink: {
    bg: "bg-pink",
    text: "text-pink",
    solid: "bg-pink text-white",
    light: "bg-pink-lt text-pink",
    gradientFrom: "from-pink",
    gradientTo: "to-purple",
    label: "Розовый",
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
  orange: {
    bg: "bg-orange",
    text: "text-orange",
    solid: "bg-orange text-white",
    light: "bg-orange-lt text-orange",
    gradientFrom: "from-orange",
    gradientTo: "to-gold",
    label: "Оранжевый",
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
  green: {
    bg: "bg-green",
    text: "text-green",
    solid: "bg-green text-white",
    light: "bg-green-lt text-green",
    gradientFrom: "from-green",
    gradientTo: "to-teal",
    label: "Зелёный",
  },
};

export function swatch(color: string | null | undefined): Swatch {
  const key = (color ?? "blue") as TripColor;
  return TRIP_COLOR_MAP[key] ?? TRIP_COLOR_MAP.blue;
}
