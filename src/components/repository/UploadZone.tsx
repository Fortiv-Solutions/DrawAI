import { useCallback, useRef, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useQueryClient } from "@tanstack/react-query";
import { importDrawingFile } from "@/repositories";
import { Upload, CheckCircle2, AlertCircle, Loader2, X, Trash2, Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface Props {
  projectId: string;
  folder: string;
  onUploaded?: () => void;
}

type Row = {
  id: string;
  name: string;
  size: number;
  pct: number;
  state: "queued" | "uploading" | "done" | "error" | "canceled";
  msg: string;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function UploadZone({ projectId, folder, onUploaded }: Props) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<Row[]>([]);
  const activeUploads = useRef(new Map<string, AbortController>());
  const canceledUploads = useRef(new Set<string>());

  const onDrop = useCallback(
    async (files: File[]) => {
      // Seed rows immediately so the user sees something.
      const uploadRows = files.map<Row>((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        size: f.size,
        pct: 0,
        state: "queued",
        msg: "Queued",
      }));
      setRows((prev) => [...prev, ...uploadRows]);

      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const rowId = uploadRows[i].id;
        if (canceledUploads.current.has(rowId)) continue;
        const controller = new AbortController();
        activeUploads.current.set(rowId, controller);
        const update = (patch: Partial<Row>) =>
          setRows((prev) => prev.map((r) => (r.id === rowId ? { ...r, ...patch } : r)));
        try {
          update({ state: "uploading", msg: "Starting…" });
          const res = await importDrawingFile({
            projectId,
            folder,
            file: f,
            signal: controller.signal,
            onProgress: (p) => update({ pct: Math.round(p * 100), msg: p < 1 ? "Uploading…" : "Saving…" }),
          });
          update({
            state: "done",
            pct: 100,
            msg: res.createdNewDrawing ? `New drawing · Rev ${res.revision.rev}` : `Added Rev ${res.revision.rev}`,
          });
        } catch (e) {
          const isAbort = e instanceof DOMException && e.name === "AbortError";
          update({ state: isAbort ? "canceled" : "error", msg: isAbort ? "Canceled" : e instanceof Error ? e.message : "Failed" });
        } finally {
          activeUploads.current.delete(rowId);
          canceledUploads.current.delete(rowId);
        }
      }
      await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      await qc.invalidateQueries({ queryKey: ["project", projectId] });
      onUploaded?.();
    },
    [projectId, folder, qc, onUploaded],
  );

  const cancelOrRemove = useCallback((row: Row) => {
    if (row.state === "queued" || row.state === "uploading") {
      canceledUploads.current.add(row.id);
      activeUploads.current.get(row.id)?.abort();
      setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, state: "canceled", msg: "Canceled" } : r)));
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/vnd.dwg": [".dwg"],
      "image/x-dxf": [".dxf"],
      "application/dxf": [".dxf"],
      "application/acad": [".dwg"],
      "application/pdf": [".pdf"],
      "image/png": [".png"],
      "image/jpeg": [".jpg", ".jpeg"],
    },
  });

  const anyUploading = rows.some((r) => r.state === "uploading" || r.state === "queued");

  return (
    <div className="space-y-3">
      <div
        {...getRootProps()}
        className={
          "flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 text-center transition " +
          (isDragActive ? "border-primary bg-primary/5" : "border-border bg-muted/30 hover:border-primary/50")
        }
      >
        <input {...getInputProps()} />
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">
          {anyUploading ? "Uploading…" : isDragActive ? "Drop files here" : "Drag DWG / DXF / PDF / images here"}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Target folder: <span className="font-medium text-foreground">{folder}</span> · revisions auto-detected
        </p>
      </div>

      {rows.length > 0 && (
        <ul className="space-y-2 rounded-md border border-border bg-card p-3">
          {rows.map((r, i) => (
            <li key={r.id} className="space-y-1.5 text-xs">
              <div className="flex items-center gap-2">
                {r.state === "queued" && <Clock className="h-3.5 w-3.5 text-muted-foreground" />}
                {r.state === "uploading" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {r.state === "done" && <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
                {(r.state === "error" || r.state === "canceled") && <AlertCircle className="h-3.5 w-3.5 text-destructive" />}
                <span className="truncate font-mono text-muted-foreground">{r.name}</span>
                <span className="text-muted-foreground">· {formatBytes(r.size)}</span>
                <span
                  className={
                    "ml-auto " +
                    (r.state === "error" || r.state === "canceled" ? "text-destructive" : r.state === "done" ? "text-foreground" : "text-muted-foreground")
                  }
                >
                  {r.state === "uploading" ? `${r.pct}%` : r.msg}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => cancelOrRemove(r)}
                  aria-label={r.state === "queued" || r.state === "uploading" ? `Cancel ${r.name}` : `Remove ${r.name}`}
                >
                  {r.state === "queued" || r.state === "uploading" ? <X className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                </Button>
              </div>
              {(r.state === "uploading" || r.state === "queued") && <Progress value={r.pct} className="h-1" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
