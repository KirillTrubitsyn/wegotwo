import type { Metadata } from "next";
import Image from "next/image";
import { submitUnlock } from "./actions";

export const metadata: Metadata = {
  title: "Вход · WeGoTwo",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<{ next?: string; error?: string }>;

const ERROR_MESSAGES: Record<string, string> = {
  missing: "Заполните оба поля",
  invalid: "Неверное имя или код",
};

export default async function UnlockPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { next = "/", error } = await searchParams;
  const message = error ? ERROR_MESSAGES[error] ?? "Ошибка входа" : null;

  return (
    <main className="min-h-[100svh] flex items-center justify-center px-6 py-10 bg-bg-surface">
      <div className="w-full max-w-[360px]">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-[88px] h-[88px] rounded-[22px] bg-white shadow-avatar mb-3">
            <Image
              src="/logo.png"
              alt="WeGoTwo"
              width={72}
              height={72}
              priority
            />
          </div>
          <h1 className="font-semibold text-[22px] tracking-tight text-text-main">
            WeGoTwo
          </h1>
          <p className="text-text-sec text-[13px] mt-1">
            Введите имя и код доступа
          </p>
        </div>

        <form
          action={submitUnlock}
          className="bg-white rounded-card shadow-card p-5 flex flex-col gap-4"
        >
          <input type="hidden" name="next" value={next} />

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-medium">
              Имя
            </span>
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              className="border border-black/10 rounded-btn px-3 py-[11px] text-[15px] focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-medium">
              Код
            </span>
            <input
              name="code"
              type="password"
              autoComplete="current-password"
              inputMode="text"
              required
              className="border border-black/10 rounded-btn px-3 py-[11px] text-[15px] focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/20"
            />
          </label>

          {message && (
            <p className="text-accent text-[13px]" role="alert">
              {message}
            </p>
          )}

          <button
            type="submit"
            className="bg-text-main text-white rounded-btn py-[12px] text-[15px] font-medium active:opacity-80 transition"
          >
            Войти
          </button>
        </form>

        <p className="text-text-mut text-[11px] text-center mt-6">
          Приватное приложение · Кирилл и Марина
        </p>
      </div>
    </main>
  );
}
