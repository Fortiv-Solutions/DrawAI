// QR helpers. Renders to an OFFSCREEN 2D canvas so the viewer's WebGL canvas
// is never repurposed (WebGL + 2D contexts are mutually exclusive on the same canvas).

import QRCode from "qrcode";

/**
 * Field-verification scan URL. When a revisionId is provided the URL encodes
 * the *printed* revision so the verification page can compare it against the
 * latest approved revision in DrawAI.
 */
export function scanUrl(
  drawingId: string, 
  revisionId?: string,
  metadata?: {
    sheetNo: string;
    title: string;
    projectName: string;
    rev: string;
    status: string;
  }
): string {
  const base = typeof window === "undefined" ? "" : window.location.origin;
  const path = revisionId ? `${base}/scan/${drawingId}/${revisionId}` : `${base}/scan/${drawingId}`;
  if (!metadata) return path;
  const params = new URLSearchParams({
    sn: metadata.sheetNo,
    t: metadata.title,
    p: metadata.projectName,
    r: metadata.rev,
    s: metadata.status,
  });
  return `${path}?${params.toString()}`;
}

export async function generateQrDataUrl(
  drawingId: string, 
  size = 256, 
  revisionId?: string,
  metadata?: {
    sheetNo: string;
    title: string;
    projectName: string;
    rev: string;
    status: string;
  }
): Promise<string> {
  return QRCode.toDataURL(scanUrl(drawingId, revisionId, metadata), {
    width: size,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

/** Composite QR + sheet metadata into a printable stamp on a separate 2D canvas. */
export async function generateQrStamp(opts: {
  drawingId: string;
  sheetNo: string;
  title: string;
  projectName: string;
  rev: string;
  revisionId?: string;
}): Promise<string> {
  const w = 600;
  const h = 200;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#0b1d3a";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  const qr = await generateQrDataUrl(opts.drawingId, 180, opts.revisionId, {
    sheetNo: opts.sheetNo,
    title: opts.title,
    projectName: opts.projectName,
    rev: opts.rev,
    status: "approved"
  });
  const img = new Image();
  await new Promise<void>((res, rej) => {
    img.onload = () => res();
    img.onerror = rej;
    img.src = qr;
  });
  ctx.drawImage(img, 12, 12, 176, 176);

  ctx.fillStyle = "#0b1d3a";
  ctx.font = "bold 20px system-ui, sans-serif";
  ctx.fillText(opts.sheetNo, 210, 40);
  ctx.font = "16px system-ui, sans-serif";
  ctx.fillText(opts.title.slice(0, 36), 210, 68);
  ctx.fillStyle = "#5a6a82";
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(opts.projectName, 210, 96);
  ctx.fillText(`Revision ${opts.rev}`, 210, 118);
  ctx.fillStyle = "#0b1d3a";
  ctx.font = "12px ui-monospace, monospace";
  ctx.fillText("Scan to verify the latest approved drawing — DrawAI", 210, 178);

  return canvas.toDataURL("image/png");
}
