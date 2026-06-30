import { useEffect, useState } from "react";
import type { ViewerProps } from "./types";

export default function ImageViewer({ blob }: ViewerProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-muted p-4">
      {url && <img src={url} alt="" className="max-h-full max-w-full object-contain shadow" />}
    </div>
  );
}
