// Export utilities for drawings. Two flows:
//   1) Original-format export + a sidecar QR PNG (the original file format
//      cannot reliably embed a QR — DWG/DXF have no portable annotation slot
//      that survives every CAD app — so the QR ships as a paired PNG).
//   2) A PDF with the QR rendered into the bottom-right corner. If the
//      original is already a PDF, we still wrap it into a single-page cover
//      PDF that carries the QR; the original is shipped alongside.

import { jsPDF } from "jspdf";
import { generateQrDataUrl } from "./qrService";
import { getRevisionBlob } from "@/repositories";
import type { DrawingSummary, Revision } from "@/domain";

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4_000);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = /data:(.*?);base64/.exec(meta)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function baseName(name: string): string {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

/** Download the original file plus a sidecar QR PNG. */
export async function exportOriginalWithQr(
  drawing: DrawingSummary,
  revision: Revision,
): Promise<void> {
  const blob = await getRevisionBlob(revision.id);
  if (!blob) throw new Error("Original file is missing in storage.");
  triggerDownload(blob, revision.fileName);

  const qrDataUrl = await generateQrDataUrl(drawing.id, 512);
  const qrBlob = dataUrlToBlob(qrDataUrl);
  triggerDownload(qrBlob, `${baseName(revision.fileName)}.qr.png`);
}

/** Generate a PDF that includes drawing metadata and a QR stamp bottom-right. */
export async function exportPdfWithQr(
  drawing: DrawingSummary,
  revision: Revision,
  projectName: string,
): Promise<void> {
  const qrDataUrl = await generateQrDataUrl(drawing.id, 600);
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 36;

  // Header block
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text(drawing.sheetNo, margin, margin + 8);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(14);
  pdf.text(drawing.title, margin, margin + 32);

  pdf.setFontSize(10);
  pdf.setTextColor(110);
  pdf.text(projectName, margin, margin + 52);
  pdf.text(
    `${drawing.discipline} · ${drawing.folder} · Rev ${revision.rev} · ${revision.status.toUpperCase()}`,
    margin,
    margin + 68,
  );

  // Body placeholder (the original file is shipped alongside; this PDF is a
  // shareable cover sheet that any phone can scan to open the latest approved).
  pdf.setTextColor(50);
  pdf.setFontSize(11);
  const bodyTop = margin + 110;
  pdf.text("Original file:", margin, bodyTop);
  pdf.setFont("helvetica", "bold");
  pdf.text(revision.fileName, margin + 80, bodyTop);
  pdf.setFont("helvetica", "normal");

  pdf.text(
    "Scan the QR code to open the latest approved revision in any browser.",
    margin,
    bodyTop + 22,
  );
  pdf.text(`Uploaded by ${revision.createdBy} on ${new Date(revision.createdAt).toLocaleString()}`, margin, bodyTop + 40);

  // Frame
  pdf.setDrawColor(180);
  pdf.setLineWidth(0.5);
  pdf.rect(margin / 2, margin / 2, pageW - margin, pageH - margin);

  // QR stamp bottom-right
  const qrSize = 140;
  const qrX = pageW - margin - qrSize;
  const qrY = pageH - margin - qrSize - 18;
  pdf.setDrawColor(40);
  pdf.setLineWidth(1);
  pdf.rect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 32);
  pdf.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);
  pdf.setFontSize(9);
  pdf.setTextColor(40);
  pdf.text(`Scan · ${drawing.sheetNo} Rev ${revision.rev}`, qrX, qrY + qrSize + 14);

  pdf.save(`${baseName(revision.fileName)}.qr.pdf`);
}
