// PDF viewer using pdfjs-dist. Renders all pages stacked, with zoom + pan via wheel.

import { useEffect, useRef, useState } from "react";
import type { ViewerProps } from "./types";

export default function PdfViewer({ blob, revision, bgTheme }: ViewerProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [msg, setMsg] = useState("Loading PDF…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!ref.current) return;
        // Legacy build avoids private-field polyfill issues (`#methodPromises`)
        // that surface with the modern bundle under Vite's dep optimizer.
        const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url")).default;
        (pdfjs as any).GlobalWorkerOptions.workerSrc = workerSrc;

        const buf = await blob.arrayBuffer();
        const doc = await (pdfjs as any).getDocument({ data: buf }).promise;
        if (cancelled) return;
        ref.current.innerHTML = "";

        const containerW = ref.current.clientWidth - 32;
        for (let i = 1; i <= doc.numPages; i++) {
          const page = await doc.getPage(i);
          const viewport = page.getViewport({ scale: 1 });
          const scale = Math.min(2, containerW / viewport.width);
          const scaled = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = scaled.width;
          canvas.height = scaled.height;
          canvas.style.maxWidth = "100%";
          canvas.style.boxShadow = "0 2px 12px rgba(0,0,0,0.15)";
          canvas.style.background = "#fff";
          canvas.style.marginBottom = "16px";
          ref.current.appendChild(canvas);
          const ctx = canvas.getContext("2d")!;
          await page.render({ canvasContext: ctx, viewport: scaled, canvas }).promise;
        }
        setStatus("ready");
      } catch (e) {
        console.error("[PdfViewer]", e);
        setStatus("error");
        setMsg(e instanceof Error ? e.message : "Failed to render PDF.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [revision.id]);

  const bgClass =
    bgTheme === "dark-slate"
      ? "bg-[#0f172a]"
      : bgTheme === "charcoal"
      ? "bg-[#1e1e1e]"
      : bgTheme === "light-slate"
      ? "bg-[#f8fafc]"
      : bgTheme === "warm-white"
      ? "bg-[#fafaf9]"
      : "bg-[#0f172a]"; // Default to dark-slate

  return (
    <div className={`relative h-full w-full overflow-auto p-4 transition-colors duration-150 ${bgClass}`}>
      <div ref={ref} className="mx-auto flex max-w-5xl flex-col items-center" />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm">
            {status === "error" ? <span className="text-destructive">{msg}</span> : msg}
          </div>
        </div>
      )}
    </div>
  );
}
