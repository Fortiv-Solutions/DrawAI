// Export dialog — DWG, DXF, or PDF (with optional QR stamp).
// DWG export ships the original blob unchanged because the in-browser engine
// cannot write DWG; edits are best preserved via DXF.

import { useState } from "react";
import { toast } from "sonner";
import { jsPDF } from "jspdf";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, FileText, FileCode2, FileType2 } from "lucide-react";
import { generateQrDataUrl } from "@/services/qrService";
import { getRevisionBlob } from "@/repositories";
import type { DrawingSummary, Revision } from "@/domain";
import type { ViewerFileResult } from "@/viewers/types";

type Fmt = "DWG" | "DXF" | "PDF";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drawing: DrawingSummary;
  revision: Revision;
  projectName: string;
  /** Returns the engine's DXF blob if available (preserves edits). */
  getDxf?: () => Promise<ViewerFileResult | null>;
  /** PNG data URL of the current canvas (for PDF embedding). */
  snapshotCanvas?: () => string | null | Promise<string | null>;
}

function baseName(name: string) {
  const i = name.lastIndexOf(".");
  return i > 0 ? name.slice(0, i) : name;
}

function trigger(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function ExportDialog({
  open, onOpenChange, drawing, revision, projectName, getDxf, snapshotCanvas,
}: Props) {
  const [fmt, setFmt] = useState<Fmt>(revision.format === "DWG" ? "DWG" : "PDF");
  const [includeQr, setIncludeQr] = useState(true);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    setBusy(true);
    try {
      const base = baseName(revision.fileName);
      if (fmt === "DXF") {
        const r = await getDxf?.();
        if (!r) throw new Error("DXF export is not available for this drawing.");
        trigger(r.blob, r.fileName ?? `${base}.dxf`);
        toast.success("DXF exported");
      } else if (fmt === "DWG") {
        const blob = await getRevisionBlob(revision.id);
        if (!blob) throw new Error("Original DWG is missing.");
        trigger(blob, revision.fileName.toLowerCase().endsWith(".dwg") ? revision.fileName : `${base}.dwg`);
        toast.success("DWG exported", {
          description: "DWG is shipped as-uploaded — edits made in-browser are preserved via DXF.",
        });
      } else {
        await exportPdf({ drawing, revision, projectName, includeQr, snapshotCanvas });
        toast.success(includeQr ? "PDF exported with QR stamp" : "PDF exported");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error("Export failed", { description: err instanceof Error ? err.message : "Unknown error" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export drawing</DialogTitle>
          <DialogDescription>
            {drawing.sheetNo} · {drawing.title} · Rev {revision.rev}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Format
            </Label>
            <RadioGroup value={fmt} onValueChange={(v) => setFmt(v as Fmt)} className="grid grid-cols-3 gap-2">
              <FmtOption value="DWG" label="DWG" hint="Original CAD" icon={<FileCode2 className="h-4 w-4" />} />
              <FmtOption value="DXF" label="DXF" hint="With edits" icon={<FileType2 className="h-4 w-4" />} />
              <FmtOption value="PDF" label="PDF" hint="Printable" icon={<FileText className="h-4 w-4" />} />
            </RadioGroup>
          </div>

          {fmt === "PDF" && (
            <label className="flex items-start gap-3 rounded-md border border-border bg-muted/40 p-3">
              <Checkbox
                checked={includeQr}
                onCheckedChange={(c) => setIncludeQr(c === true)}
                className="mt-0.5"
              />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">Include QR code</div>
                <div className="text-xs text-muted-foreground">
                  Stamps a verification QR in the bottom-right title block. Scanning the
                  printed sheet on-site checks whether the revision is still the latest approved.
                </div>
              </div>
            </label>
          )}

          {fmt === "DWG" && (
            <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              DWG is downloaded as the originally uploaded file. To carry your in-browser edits, export as DXF.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={busy}>
            <Download className="mr-2 h-4 w-4" />
            {busy ? "Exporting…" : `Export ${fmt}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FmtOption({ value, label, hint, icon }: { value: string; label: string; hint: string; icon: React.ReactNode }) {
  return (
    <label
      htmlFor={`fmt-${value}`}
      className="flex cursor-pointer flex-col items-start gap-1 rounded-md border border-border bg-card p-3 text-sm transition hover:border-primary/40 has-[input:checked]:border-primary has-[input:checked]:bg-primary/5"
    >
      <div className="flex items-center gap-2">
        <RadioGroupItem value={value} id={`fmt-${value}`} />
        {icon}
        <span className="font-medium">{label}</span>
      </div>
      <span className="pl-6 text-xs text-muted-foreground">{hint}</span>
    </label>
  );
}

async function exportPdf(opts: {
  drawing: DrawingSummary;
  revision: Revision;
  projectName: string;
  includeQr: boolean;
  snapshotCanvas?: () => string | null | Promise<string | null>;
}) {
  const { drawing, revision, projectName, includeQr, snapshotCanvas } = opts;
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 28;

  // Outer border
  pdf.setDrawColor(60);
  pdf.setLineWidth(1);
  pdf.rect(margin, margin, pageW - margin * 2, pageH - margin * 2);

  // Drawing snapshot fills the main area (if available)
  const snap = await snapshotCanvas?.();

  const innerX = margin + 8;
  const innerY = margin + 8;
  const innerW = pageW - margin * 2 - 16;
  const innerH = pageH - margin * 2 - 110; // reserve bottom for title block

  if (!snap) {
    throw new Error("Drawing preview is not ready yet. Wait for the CAD view to finish loading, then export again.");
  }

  // Load image to compute its aspect ratio and center it perfectly in the viewport box
  let drawX = innerX;
  let drawY = innerY;
  let drawW = innerW;
  let drawH = innerH;

  try {
    const img = new Image();
    img.src = snap;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject();
    });
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    if (imgW > 0 && imgH > 0) {
      const imgAspect = imgW / imgH;
      const boxAspect = innerW / innerH;
      if (imgAspect > boxAspect) {
        // Width is the constraint
        drawW = innerW;
        drawH = innerW / imgAspect;
        drawY = innerY + (innerH - drawH) / 2;
      } else {
        // Height is the constraint
        drawH = innerH;
        drawW = innerH * imgAspect;
        drawX = innerX + (innerW - drawW) / 2;
      }
    }
  } catch (err) {
    console.warn("[ExportDialog] Could not determine image aspect ratio, falling back to stretch fit", err);
  }

  try {
    pdf.addImage(snap, "PNG", drawX, drawY, drawW, drawH);
  } catch {
    throw new Error("Could not embed the drawing snapshot in the PDF.");
  }

  // Title block (bottom strip)
  const tbY = innerY + innerH + 8;
  const tbH = pageH - margin - tbY - 8;
  pdf.setDrawColor(40);
  pdf.setLineWidth(0.8);
  pdf.rect(innerX, tbY, innerW, tbH);

  const qrSize = Math.min(tbH - 12, 88);
  const qrX = innerX + innerW - qrSize - 8;
  const qrY = tbY + (tbH - qrSize) / 2;

  // Text block
  pdf.setTextColor(20);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(14);
  pdf.text(drawing.sheetNo, innerX + 12, tbY + 22);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(12);
  pdf.text(drawing.title, innerX + 12, tbY + 40);
  pdf.setFontSize(9);
  pdf.setTextColor(90);
  pdf.text(projectName, innerX + 12, tbY + 56);
  pdf.text(
    `${drawing.discipline} · Rev ${revision.rev} · ${revision.status.toUpperCase()} · ${new Date(revision.createdAt).toLocaleDateString()}`,
    innerX + 12,
    tbY + 70,
  );

  if (includeQr) {
    const qr = await generateQrDataUrl(drawing.id, 480, revision.id);
    pdf.setDrawColor(40);
    pdf.setLineWidth(0.5);
    pdf.rect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8);
    pdf.addImage(qr, "PNG", qrX, qrY, qrSize, qrSize);
    pdf.setFontSize(7);
    pdf.setTextColor(60);
    pdf.text("Scan to verify revision", qrX, qrY + qrSize + 10);
  }

  pdf.save(`${baseName(revision.fileName)}-Rev${revision.rev}.pdf`);
}
