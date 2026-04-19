# WeGoTwo

Приватный PWA-планировщик поездок для двух пользователей. Next.js 15 + Supabase + Gemini 3.1 Flash Lite, развёртывается на Vercel.

## Что уже есть (Этап 1)

1. Скелет проекта Next.js 15 с TypeScript, Tailwind, PWA.
2. Полная схема базы данных Supabase: 15 таблиц, RLS-политики, три приватных Storage-бакета.
3. Клиенты Supabase для браузера, сервера и admin-операций.
4. Внешний периметр доступа: middleware с подписанным cookie и страница `/unlock`, проверяющая коды из `WEGOTWO_ACCESS_CODES`.
5. Стартовая витрина поездок и каркас страницы поездки.

## Подготовка окружения

### Требования

Node.js 20 или новее, аккаунты Supabase, Vercel, Google AI Studio.

### Шаг 1. Supabase

Создайте новый проект на [supabase.com](https://supabase.com). Регион ближайший (например, `eu-central-1`). Сохраните из **Project Settings → API**:

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.

Установите Supabase CLI и прокиньте миграции:

```bash
npm install -g supabase
supabase login
supabase link --project-ref <project_ref>
supabase db push
```

Альтернативно: откройте Supabase Dashboard → SQL Editor, скопируйте содержимое всех файлов из `supabase/migrations/` по порядку и выполните.

В **Authentication → Providers → Email** оставьте только magic-link. Позже пригласите второго пользователя.

### Шаг 2. Gemini

Получите ключ в [Google AI Studio](https://aistudio.google.com/app/apikey). Скопируйте в `GEMINI_API_KEY`.

### Шаг 3. Переменные окружения

Скопируйте `.env.example` в `.env.local` и заполните. Сгенерируйте секреты:

```bash
openssl rand -base64 48   # WEGOTWO_COOKIE_SECRET
openssl rand -hex 32      # INGEST_TOKEN
```

Пример `WEGOTWO_ACCESS_CODES`:

```
WEGOTWO_ACCESS_CODES={"kirill":"придумай-код-1","marina":"придумай-код-2"}
```

Имена в нижнем регистре. Коды можно ротировать без деплоя кода, только правкой env на Vercel с последующим Redeploy.

### Шаг 4. Установка и запуск

```bash
cd wegotwo
npm install
npm run dev
```

Откройте `http://localhost:3000`. Любой путь, кроме `/unlock`, перебросит на форму входа. Введите имя и код из `WEGOTWO_ACCESS_CODES`, сессия сохранится в cookie на 90 дней.

### Шаг 5. Деплой на Vercel

```bash
npx vercel link
npx vercel env pull .env.local   # подтянуть значения после добавления на Vercel
npx vercel --prod
```

Все переменные из `.env.example` должны быть заведены в Vercel (Project Settings → Environment Variables) для окружений Production и Preview.

Доменом по умолчанию будет `wegotwo.vercel.app` или `wegotwo-<hash>.vercel.app`.

## Структура репозитория

```
wegotwo/
├── src/
│   ├── app/
│   │   ├── layout.tsx          корневой layout, мобильный контейнер 480px
│   │   ├── page.tsx            стартовая витрина поездок
│   │   ├── globals.css
│   │   ├── unlock/             форма и Server Action входа
│   │   └── trips/
│   │       ├── new/            создание поездки (заглушка Этапа 1)
│   │       └── [slug]/         страница конкретной поездки (заглушка)
│   ├── components/
│   │   ├── Header.tsx
│   │   └── TripCard.tsx
│   └── lib/
│       ├── supabase/{client,server,admin}.ts
│       ├── auth/{access-codes,unlock-token}.ts
│       └── types.ts
├── middleware.ts               внешний периметр доступа
├── supabase/
│   └── migrations/             схема БД + RLS + storage buckets
├── public/
│   ├── manifest.json           PWA manifest
│   └── icons/                  иконки (добавить перед деплоем)
├── scripts/                    cowork-ingest.mjs появится на Этапе 4
└── README.md
```

## Что дальше

Этап 2: полноценные экраны поездки (Обзор, Дни, Документы), перенос компонентов из `europe-2026`, PdfViewer.

Этап 3: бюджет, курсы валют из ЦБ РФ и ECB, ручной ввод расходов.

Этап 4: Cowork-ингест документов через Gemini 3.1 Flash Lite.

Этап 5: сканирование чеков с iPhone.

Этап 6: фотогалерея с HEIC-конвертацией и группировкой по дням.

Этап 7: наполнение поездки «Черногория 2026» и выдача доступа.

<!-- trigger redeploy -->
