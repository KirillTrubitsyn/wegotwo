"use client";

/**
 * ИИ-разбор документа.
 *
 * Три состояния:
 *   1. not analyzed (parsed_status null / pending / skipped / failed)
 *      → кнопка «Проанализировать через ИИ».
 *   2. needs_review (Gemini отработал, parsed_fields заполнены)
 *      → предпросмотр полей + «Создать» / «Пропустить».
 *   3. parsed (уже создан flights/stays/expenses row)
 *      → отметка «Создано» со ссылкой на связанный ряд.
 *
 * Всё через useActionState поверх server actions в ingest-actions.ts.
 */
import { useActionState } from "react";
import {
  analyzeDocumentAction,
  commitIngestAction,
  clearIngestAction,
  type IngestState,
} from "./ingest-actions";

type ParsedShape = {
  type?: "flight" | "stay" | "expense" | "unknown";
  summary?: string;
  confidence?: number;
  flight?: Record<string, string | number | null>;
  stay?: Record<string, string | number | null>;
  expense?: Record<string, string | number | null>;
  error?: string;
};

type Props = {
  slug: string;
  docId: string;
  status: "pending" | "needs_review" | "parsed" | "failed" | "skipped" | null;
  parsedFields: unknown;
  linkedRowUrl?: string | null;
};

const INITIAL: IngestState = { ok: true };

function labelForType(t?: string | null): string {
  switch (t) {
    case "flight":
      return "Рейс";
    case "stay":
      return "Проживание";
    case "expense":
      return "Расход";
    case "unknown":
      return "Не распознано";
    default:
      return "Документ";
  }
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-baseline gap-3 py-[6px] border-b border-black/[0.05] last:border-0">
      <div className="text-[11px] uppercase tracking-[0.5px] text-text-sec w-[110px] shrink-0">
        {label}
      </div>
      <div className="text-[13px] text-text-main flex-1 break-words">
        {value}
      </div>
    </div>
  );
}

function FlightGrid({ f }: { f: Record<string, string | number | null> }) {
  return (
    <div>
      <Row label="Авиакомпания" value={f.airline as string} />
      <Row label="Рейс" value={f.code as string} />
      <Row
        label="Откуда"
        value={[f.from_city, f.from_code].filter(Boolean).join(" · ")}
      />
      <Row
        label="Куда"
        value={[f.to_city, f.to_code].filter(Boolean).join(" · ")}
      />
      <Row label="Вылет" value={f.dep_at as string} />
      <Row label="Прилёт" value={f.arr_at as string} />
      <Row label="Место" value={f.seat as string} />
      <Row label="PNR" value={f.pnr as string} />
      <Row label="Багаж" value={f.baggage as string} />
      <Row label="Терминал" value={f.terminal as string} />
    </div>
  );
}

function StayGrid({ s }: { s: Record<string, string | number | null> }) {
  return (
    <div>
      <Row label="Название" value={s.title as string} />
      <Row label="Адрес" value={s.address as string} />
      <Row label="Заезд" value={s.check_in as string} />
      <Row label="Выезд" value={s.check_out as string} />
      <Row label="Хозяин" value={s.host as string} />
      <Row label="Телефон" value={s.host_phone as string} />
      <Row label="Код брони" value={s.confirmation as string} />
      <Row
        label="Стоимость"
        value={
          s.price != null
            ? `${s.price}${s.currency ? " " + String(s.currency) : ""}`
            : null
        }
      />
      <Row label="Страна" value={s.country_code as string} />
    </div>
  );
}

function ExpenseGrid({ e }: { e: Record<string, string | number | null> }) {
  return (
    <div>
      <Row label="Где" value={e.merchant as string} />
      <Row label="Описание" value={e.description as string} />
      <Row label="Дата" value={e.occurred_on as string} />
      <Row
        label="Сумма"
        value={
          e.amount != null
            ? `${e.amount}${e.currency ? " " + String(e.currency) : ""}`
            : null
        }
      />
      <Row label="Категория" value={e.category as string} />
    </div>
  );
}

export default function IngestPanel({
  slug,
  docId,
  status,
  parsedFields,
  linkedRowUrl,
}: Props) {
  const analyze = analyzeDocumentAction.bind(null, slug, docId);
  const commit = commitIngestAction.bind(null, slug, docId);
  const clear = clearIngestAction.bind(null, slug, docId);

  const [aState, aAction, aPending] = useActionState<IngestState, FormData>(
    analyze,
    INITIAL
  );
  const [cState, cAction, cPending] = useActionState<IngestState, FormData>(
    commit,
    INITIAL
  );
  const [sState, sAction, sPending] = useActionState<IngestState, FormData>(
    clear,
    INITIAL
  );

  const pd = (parsedFields ?? null) as ParsedShape | null;
  const canCommit =
    status === "needs_review" && pd && pd.type && pd.type !== "unknown";

  // --- state 3: already parsed ---
  if (status === "parsed") {
    return (
      <section className="bg-green-lt border border-green/20 rounded-card p-4 space-y-2">
        <div className="text-[11px] uppercase tracking-[0.6px] text-green font-semibold">
          Создано из документа
        </div>
        <div className="text-[14px] text-text-main">
          {pd?.summary ?? labelForType(pd?.type)}
        </div>
        {linkedRowUrl ? (
          <a
            href={linkedRowUrl}
            className="inline-block text-[13px] text-green underline"
          >
            Открыть запись →
          </a>
        ) : null}
      </section>
    );
  }

  // --- state 2: ready for review ---
  if (status === "needs_review" && pd) {
    return (
      <section className="bg-white rounded-card shadow-card p-5 space-y-4">
        <div className="flex items-baseline justify-between">
          <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
            ИИ-разбор
          </div>
          <div className="text-[11px] text-text-sec">
            {pd.confidence != null
              ? `уверенность ${Math.round(pd.confidence * 100)} %`
              : null}
          </div>
        </div>

        <div>
          <div className="inline-block bg-blue-lt text-blue rounded-badge px-2 py-[2px] text-[11px] font-semibold uppercase tracking-[0.5px]">
            {labelForType(pd.type)}
          </div>
          {pd.summary ? (
            <div className="text-[14px] text-text-main mt-2">{pd.summary}</div>
          ) : null}
        </div>

        {pd.type === "flight" && pd.flight ? <FlightGrid f={pd.flight} /> : null}
        {pd.type === "stay" && pd.stay ? <StayGrid s={pd.stay} /> : null}
        {pd.type === "expense" && pd.expense ? (
          <ExpenseGrid e={pd.expense} />
        ) : null}

        {pd.type === "unknown" ? (
          <div className="text-[13px] text-text-sec">
            Документ не классифицирован как рейс, проживание или расход. Можно
            отметить его как не требующий ингеста.
          </div>
        ) : null}

        {cState.ok === false ? (
          <div className="bg-red-lt text-accent text-[13px] rounded-btn p-3">
            {cState.error}
          </div>
        ) : null}
        {cState.ok && cState.message ? (
          <div className="bg-green-lt text-green text-[13px] rounded-btn p-3">
            {cState.message}
          </div>
        ) : null}

        <div className="flex gap-2 pt-1">
          {canCommit ? (
            <form action={cAction} className="flex-1">
              <button
                type="submit"
                disabled={cPending}
                className="w-full bg-blue text-white rounded-btn py-[12px] text-[14px] font-semibold active:bg-blue/90 disabled:opacity-60"
              >
                {cPending ? "Создаю…" : "Создать запись"}
              </button>
            </form>
          ) : null}
          <form action={sAction} className="flex-1">
            <button
              type="submit"
              disabled={sPending}
              className="w-full bg-white border border-black/[0.08] text-text-main rounded-btn py-[12px] text-[14px] font-medium active:bg-bg-surface disabled:opacity-60"
            >
              {sPending ? "…" : "Пропустить"}
            </button>
          </form>
        </div>
        {sState.ok === false ? (
          <div className="text-[12px] text-accent">{sState.error}</div>
        ) : null}

        <form action={aAction}>
          <button
            type="submit"
            disabled={aPending}
            className="w-full text-[12px] text-blue underline-offset-2 hover:underline disabled:opacity-60"
          >
            {aPending ? "Анализирую…" : "Проанализировать заново"}
          </button>
        </form>
      </section>
    );
  }

  // --- state 1 or failed/skipped: invite to analyze ---
  const banner =
    status === "failed"
      ? "Прошлая попытка не удалась. Можно повторить."
      : status === "skipped"
      ? "Документ был помечен как не требующий ингеста. Можно всё равно запустить анализ."
      : null;

  return (
    <section className="bg-white rounded-card shadow-card p-5 space-y-3">
      <div className="text-[11px] uppercase tracking-[0.6px] text-text-sec font-semibold">
        ИИ-разбор
      </div>
      <div className="text-[13px] text-text-sec">
        Извлечём поля из документа и создадим рейс, проживание или расход.
        Модель работает через Gemini, всё остаётся в пределах поездки.
      </div>
      {banner ? (
        <div className="text-[12px] text-text-sec bg-bg-surface rounded-btn p-2">
          {banner}
        </div>
      ) : null}
      {aState.ok === false ? (
        <div className="bg-red-lt text-accent text-[13px] rounded-btn p-3">
          {aState.error}
        </div>
      ) : null}
      <form action={aAction}>
        <button
          type="submit"
          disabled={aPending}
          className="w-full bg-blue text-white rounded-btn py-[12px] text-[14px] font-semibold active:bg-blue/90 disabled:opacity-60"
        >
          {aPending ? "Анализирую…" : "Проанализировать через ИИ"}
        </button>
      </form>
    </section>
  );
}
