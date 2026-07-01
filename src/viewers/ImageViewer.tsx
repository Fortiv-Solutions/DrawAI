import { useEffect, useState } from "react";
import type { ViewerProps } from "./types";

export default function ImageViewer({ blob, bgTheme }: ViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  const bgClass =
    bgTheme === "dark-slate"
      ? "bg-[#0f172a]"
      : bgTheme === "charcoal"
      ? "bg-[#1e1e1e]"
      : bgTheme === "light-slate"
      ? "bg-[#f8fafc]"
      : bgTheme === "warm-white"
      ? "bg-[#fafaf9]"
      : "bg-[#0f172a]";

  return (
    <div className={`flex h-full w-full items-center justify-center overflow-auto p-4 transition-colors duration-150 ${bgClass}`}>
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain shadow" />}
    </div>
  );
}
