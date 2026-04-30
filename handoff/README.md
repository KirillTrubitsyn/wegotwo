# Handoff — E·L1 Design in WeGoTwo

Готовый набор файлов для встраивания дизайна **E·L1** (белый фон, Fraunces, монолейблы) в ваш репозиторий `github.com/KirillTrubitsyn/wegotwo`.

## Что кладётся куда

| Файл в `handoff/`          | Куда в репо                                         | Действие                           |
|----------------------------|-----------------------------------------------------|------------------------------------|
| `layout.tsx`               | `src/app/layout.tsx`                                | **Заменить** — добавлен Fraunces   |
| `page.tsx`                 | `src/app/page.tsx`                                  | **Заменить** — E·L1 главная        |
| `day-detail.tsx`           | `src/app/trips/[slug]/days/[n]/page.tsx`            | **Заменить** — D2 по фазам         |
| `tailwind.config.ts`       | Инструкции по доработке существующего `tailwind.config.ts` | **Вмёржить** — добавить `serif` и цвета |

## Шаги

1. Скопируйте три `.tsx` файла по путям из таблицы.
2. Откройте `handoff/tailwind.config.ts` — там комментарии, какие ключи добавить в ваш `theme.extend.fontFamily` (`serif`) и `theme.extend.colors` (`ink`, `paper`, `fog`, `rule`). Значения по умолчанию работают и без этих токенов, но с ними код читается чище, если захотите рефакторить.
3. `npm run dev` → `/` покажет новую главную, `/trips/<slug>/days/1` — D2.

## Что требует вашего внимания (TODO)

В `day-detail.tsx` четыре метрики (Потрачено/КМ/Фото/Погода) — **моки**.
Рядом оставлен комментарий `TODO(real data)` с пояснением, из каких таблиц тянуть:

- **Потрачено:** `expenses.amount_rub_norm` where `date = day.date`
- **КМ:** из событий `kind IN (flight, transfer)` с полем `distance_km`
- **Фото:** `count(photos)` where `taken_at::date = day.date`
- **Погода:** через ваш существующий `useWeather` хук (нужны `lat`/`lon` города дня)

## Что осталось как было

- Все Server Actions (`actions.ts`) — без изменений.
- Компоненты `Timeline`, `BottomNav`, `OfflineBanner`, `DayActionsMenu` — переиспользуются/заменены в D2 своим упрощённым рендером. `Timeline` не импортируется в D2, т.к. фазовый вид самостоятельный — можно восстановить при желании.
- Экран поездки `/trips/[slug]` и бюджет — не трогаем в этом заходе.

## Следующие шаги (после приёмки главной + D2)

- Дни-список `days/page.tsx` в E·L1.
- Экран поездки-обзора `/trips/[slug]/page.tsx`.
- Форма события `EventForm.tsx` в том же языке.
- Архив `/archive`.
