"use client";

/**
 * Lightweight first-page PDF preview via pdfjs-dist.
 *
 * We load the library dynamically to keep it out of the main
 * bundle. The worker runs from the same CDN build pdfjs-dist
 * already publishes, which avoids hand-copying the worker file
 * into /public.
 *
 * The component only renders page 1. For multi-page navigation
 * users can open the signed URL in a new tab via the "Открыть"
 * link on the document page.
 */
import { useEffect, useRef, useState } from "react";

type Props = {
  url: string;
};

export default function PdfPreview({ url }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function render() {
      try {
        const pdfjs = await import("pdfjs-dist");
        // Pin worker to the same version we bundle.
        const workerUrl = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

        const loadingTask = pdfjs.getDocument({ url });
        const pdf = await loadingTask.promise;
        if (cancelled) return;

        const page = await pdf.getPage(1);
        if (cancelled) return;

        const canvas = canvasRef.current;
        if (!canvas) return;

        const container = canvas.parentElement;
        const targetWidth = container?.clientWidth ?? 360;

        const viewport = page.getViewport({ scale: 1 });
        const scale = targetWidth / viewport.width;
        const scaled = page.getViewport({ scale });

        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(scaled.width * dpr);
        canvas.height = Math.floor(scaled.height * dpr);
        canvas.style.width = `${Math.floor(scaled.width)}px`;
        canvas.style.height = `${Math.floor(scaled.height)}px`;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        await page.render({
          canvasContext: ctx,
          viewport: scaled,
        }).promise;
        if (!cancelled) setLoading(false);
      } catch (e: unknown) {
        if (cancelled) return;
        setError(
          e instanceof Error ? e.message : "Не удалось отрисовать PDF"
        );
        setLoading(false);
      }
    }

    render();
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <div className="bg-white rounded-card shadow-card overflow-hidden">
      <div className="p-3">
        {loading && !error && (
          <div className="text-[13px] text-text-sec text-center py-10">
            Загрузка превью…
          </div>
        )}
        {error && (
          <div className="text-[13px] text-accent text-center py-6">
            {error}
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={`mx-auto ${loading || error ? "hidden" : "block"}`}
        />
      </div>
    </div>
  );
}
