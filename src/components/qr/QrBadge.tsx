import { useEffect, useState } from "react";
import { generateQrDataUrl, generateQrStamp, scanUrl } from "@/services/qrService";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

interface Props {
  drawingId: string;
  sheetNo: string;
  title: string;
  projectName: string;
  rev: string;
  revisionId?: string;
  size?: number;
}

export function QrBadge({ drawingId, sheetNo, title, projectName, rev, revisionId, size = 200 }: Props) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    generateQrDataUrl(drawingId, size, revisionId).then((u) => !cancelled && setUrl(u));
    return () => {
      cancelled = true;
    };
  }, [drawingId, size, revisionId]);

  async function downloadStamp() {
    const data = await generateQrStamp({ drawingId, sheetNo, title, projectName, rev, revisionId });
    const a = document.createElement("a");
    a.href = data;
    a.download = `${sheetNo}-QR.png`;
    a.click();
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-card p-4">
      {url ? (
        <img src={url} alt={`QR code for ${sheetNo}`} width={size} height={size} className="rounded" />
      ) : (
        <div style={{ width: size, height: size }} className="animate-pulse rounded bg-muted" />
      )}
      <div className="text-center">
        <div className="font-mono text-xs text-muted-foreground">{sheetNo}</div>
        <a href={scanUrl(drawingId, revisionId)} className="text-xs text-primary hover:underline" target="_blank" rel="noreferrer">
          Open scan URL
        </a>
      </div>
      <Button onClick={downloadStamp} size="sm" variant="outline">
        <Download className="mr-2 h-4 w-4" />
        Download QR stamp
      </Button>
    </div>
  );
}
