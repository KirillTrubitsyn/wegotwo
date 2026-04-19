export const CATEGORY_LABELS: Record<string, { label: string; icon: string }> = {
  flight: { label: "Перелёт", icon: "✈" },
  transport: { label: "Транспорт", icon: "🚂" },
  accommodation: { label: "Проживание", icon: "🏠" },
  restaurant: { label: "Ресторан", icon: "🍽" },
  groceries: { label: "Продукты", icon: "🛒" },
  tours: { label: "Экскурсии", icon: "🎫" },
  activities: { label: "Активности", icon: "🎯" },
  tickets: { label: "Билеты", icon: "🎭" },
  shopping: { label: "Покупки", icon: "🛍" },
  telecom: { label: "Связь", icon: "📶" },
  fees: { label: "Сборы", icon: "💳" },
  other: { label: "Другое", icon: "•" },
};

export const CURRENCY_SYMBOLS: Record<string, string> = {
  RUB: "₽",
  EUR: "€",
  USD: "$",
  CHF: "₣",
  GBP: "£",
  RSD: "дин",
  TRY: "₺",
  GEL: "₾",
};

export function formatMoney(
  amount: number,
  currency: string,
  opts: { sign?: boolean } = {}
): string {
  const sym = CURRENCY_SYMBOLS[currency] ?? currency;
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: abs >= 100 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs);
  const sign = opts.sign && amount > 0 ? "+" : amount < 0 ? "-" : "";
  return `${sign}${formatted} ${sym}`;
}

export const PAYER_LABELS: Record<string, string> = {
  kirill: "Кирилл",
  marina: "Марина",
  both: "Оба",
};

export const SPLIT_LABELS: Record<string, string> = {
  equal: "Пополам",
  payer: "Только плательщик",
};
