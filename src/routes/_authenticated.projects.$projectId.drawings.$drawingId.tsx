import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { recordRecent } from "@/lib/recents";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Tabs, TabsContent, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  getDrawing, listRevisions, setRevisionStatus, setCurrentRevision,
  saveRevisionBlob, getProject,
} from "@/repositories";
import { StatusPill } from "@/components/StatusPill";
import { ViewerHost } from "@/viewers/ViewerHost";
import { QrBadge } from "@/components/qr/QrBadge";
import { ExportDialog } from "@/components/editor/ExportDialog";
import {
  ArrowLeft, Download, Save, Check, GitBranch, Trash2,
  ZoomIn, ZoomOut, Undo, Redo, Maximize2, ClipboardCheck, X,
  MousePointer2, Hand, Move, Copy, RotateCw, Scaling, Ruler,
  Square, Compass, SkipBack, SkipForward, Loader2, Circle,
  Minus, Spline, RectangleHorizontal, Slash, SlidersHorizontal,
} from "lucide-react";

const drawingQuery = (id: string) => ({
  queryKey: ["drawing", id] as const,
  queryFn: async () => {
    const d = await getDrawing(id);
    if (!d) throw notFound();
    return d;
  },
});
const revisionsQuery = (id: string) => ({ queryKey: ["revisions", id] as const, queryFn: () => listRevisions(id) });

export const Route = createFileRoute("/_authenticated/projects/$projectId/drawings/$drawingId")({
  head: ({ params }) => ({
    meta: [
      { title: `Drawing ${params.drawingId} — DrawAI` },
      { name: "description", content: "View, mark up, and verify the current approved revision." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(drawingQuery(params.drawingId)),
      context.queryClient.ensureQueryData(revisionsQuery(params.drawingId)),
    ]);
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">Drawing not found.</div>
  ),
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-destructive">Failed to load drawing.</div>
  ),
  component: DrawingPage,
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode === "edit" ? "edit" : "view",
  }),
});

function DrawingPage() {
  const { projectId, drawingId } = Route.useParams();
  const { mode } = Route.useSearch();
  const qc = useQueryClient();
  const { data: d } = useSuspenseQuery(drawingQuery(drawingId));
  const { data: revisions } = useSuspenseQuery(revisionsQuery(drawingId));
  const { data: project } = useSuspenseQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId) });

  const [activeRevId, setActiveRevId] = useState<string>(d.currentRevisionId);
  const activeRev = revisions.find((r) => r.id === activeRevId) ?? revisions[revisions.length - 1];
  const editable = !!activeRev && activeRev.status !== "superseded" && mode === "edit";

  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [bgTheme, setBgTheme] = useState<"dark-slate" | "charcoal" | "light-slate" | "warm-white">(
    mode === "edit" ? "dark-slate" : "light-slate"
  );

  useEffect(() => {
    setBgTheme(mode === "edit" ? "dark-slate" : "light-slate");
  }, [mode]);

  useEffect(() => {
    recordRecent({ drawingId: d.id, projectId, title: d.title, kind: "opened" });
  }, [d.id, d.title, projectId]);

  const runCmdRef = useRef<((cmd: string) => void) | null>(null);
  const saveRef = useRef<(() => Promise<{ blob: Blob; fileName?: string } | null>) | null>(null);
  const exportRef = useRef<(() => Promise<{ blob: Blob; fileName?: string } | null>) | null>(null);
  const snapshotRef = useRef<(() => string | null | Promise<string | null>) | null>(null);

  const runCmd = (cmd: string) => runCmdRef.current?.(cmd);

  async function handleSave() {
    if (!activeRev || !saveRef.current) {
      toast.error("Save is not available for this file");
      return;
    }
    setSaving(true);
    try {
      const result = await saveRef.current();
      if (!result) throw new Error("Nothing to save.");
      await saveRevisionBlob(activeRev.id, result.blob, result.fileName);
      recordRecent({ drawingId: d.id, projectId, title: d.title, kind: "edited" });
      await qc.invalidateQueries({ queryKey: ["revisions", drawingId] });
      await qc.invalidateQueries({ queryKey: ["drawing", drawingId] });
      await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
      setDirty(false);
      setLastSavedAt(Date.now());
      toast.success("Changes saved", {
        description: `Revision ${activeRev.rev} updated · ${new Date().toLocaleTimeString()}`,
      });
    } catch (err) {
      toast.error("Save failed", {
        description: err instanceof Error ? err.message : "Your edits are still in the editor — try again.",
      });
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!activeRev) return;
    await setRevisionStatus(activeRev.id, "approved");
    await qc.invalidateQueries({ queryKey: ["revisions", drawingId] });
    await qc.invalidateQueries({ queryKey: ["drawing", drawingId] });
    await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
    toast.success("Revision approved");
  }
  async function submitReview() {
    if (!activeRev) return;
    await setRevisionStatus(activeRev.id, "under_review");
    await qc.invalidateQueries({ queryKey: ["revisions", drawingId] });
    await qc.invalidateQueries({ queryKey: ["drawing", drawingId] });
  }

  // Keyboard shortcuts in edit mode
  useEffect(() => {
    if (!editable) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); runCmd("ERASE"); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); runCmd(e.shiftKey ? "REDO" : "UNDO"); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); runCmd("REDO"); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void handleSave(); }
      else if (e.key === "Escape") { runCmd("CANCEL"); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, activeRev?.id]);

  // Warn on unload while dirty
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // FULL-SCREEN EDIT MODE
  if (editable && activeRev) {
    return (
      <TooltipProvider delayDuration={200}>
        <div className="flex h-screen w-screen flex-col bg-background">
          {/* WORD-STYLE TITLE BAR (TOP ROW) */}
          <div className="flex h-9 w-full items-center justify-between border-b border-border bg-muted/40 px-3 select-none">
            {/* Left: Minimal Back Button */}
            <div className="flex items-center gap-2">
              <Button asChild variant="ghost" size="xs" className="h-7 w-7 p-0 rounded-md">
                <Link to="/projects/$projectId" params={{ projectId }} title="Back to Drawing Registry">
                  <ArrowLeft className="h-4.5 w-4.5 text-muted-foreground hover:text-foreground" />
                </Link>
              </Button>
              <div className="h-4 w-[1px] bg-border/80" />
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground/80">
                <span className="font-mono">{d.sheetNo}</span>
                <span>·</span>
                <span className="truncate max-w-[200px]">{d.title}</span>
                <Badge variant="outline" className="font-mono text-[9px] h-4 py-0 px-1 border-border/80 text-muted-foreground/80">{activeRev.rev}</Badge>
              </div>
            </div>

            {/* Right: Minimal Status Indicator */}
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground/85">
              {saving ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                  <span>Saving…</span>
                </>
              ) : dirty ? (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span className="text-amber-600 dark:text-amber-400">Unsaved changes</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>{lastSavedAt ? `Saved at ${new Date(lastSavedAt).toLocaleTimeString()}` : "Saved"}</span>
                </>
              )}
            </div>
          </div>

          {/* WORD-STYLE TOOLBAR RIBBON (BOTTOM ROW) */}
          <div className="flex h-16 w-full items-center bg-card border-b border-border px-3 overflow-x-auto py-1 select-none">
            {/* Group 1: Canvas Theme */}
            <Group label="Theme">
              <div className="flex items-center gap-1.5 h-8">
                {[
                  { id: "dark-slate", color: "bg-[#0f172a] border-slate-700", tooltip: "Dark Slate" },
                  { id: "charcoal", color: "bg-[#1e1e1e] border-neutral-700", tooltip: "Charcoal" },
                  { id: "light-slate", color: "bg-[#f8fafc] border-slate-200", tooltip: "Light Slate" },
                  { id: "warm-white", color: "bg-[#fafaf9] border-stone-200", tooltip: "Warm Sand" },
                ].map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => setBgTheme(theme.id as any)}
                    className={`h-5 w-5 rounded-full border transition-all ${
                      bgTheme === theme.id ? "ring-2 ring-primary ring-offset-1 scale-110 shadow-sm" : "hover:scale-105"
                    }`}
                    title={theme.tooltip}
                  >
                    <span className={`block h-full w-full rounded-full border ${theme.color}`} />
                  </button>
                ))}
              </div>
            </Group>

            {/* Group 2: Navigation */}
            <Group label="Navigation">
              <Tool icon={<MousePointer2 className="h-4 w-4" />} label="Select" onClick={() => runCmd("SELECT")} />
              <Tool icon={<Hand className="h-4 w-4" />} label="Pan" onClick={() => runCmd("PAN")} />
              <Tool icon={<ZoomIn className="h-4 w-4" />} label="Zoom In" onClick={() => runCmd("ZOOM_IN")} />
              <Tool icon={<ZoomOut className="h-4 w-4" />} label="Zoom Out" onClick={() => runCmd("ZOOM_OUT")} />
              <Tool icon={<Maximize2 className="h-4 w-4" />} label="Zoom Extents" onClick={() => runCmd("ZOOM_EXTENTS")} />
            </Group>

            {/* Group 3: Edit & Resize */}
            <Group label="Modify">
              <Tool icon={<Move className="h-4 w-4" />} label="Move" onClick={() => runCmd("MOVE")} />
              <Tool icon={<Scaling className="h-4 w-4 text-primary" />} label="Resize (Scale)" onClick={() => runCmd("RESIZE")} />
              <Tool icon={<Trash2 className="h-4 w-4 text-destructive" />} label="Delete" onClick={() => runCmd("ERASE")} />
            </Group>

            {/* Group 4: Drawing Tools */}
            <Group label="Draw">
              <Tool icon={<Minus className="h-4 w-4" />} label="Line" onClick={() => runCmd("LINE")} />
              <Tool icon={<Spline className="h-4 w-4" />} label="Polyline" onClick={() => runCmd("PLINE")} />
              <Tool icon={<Circle className="h-4 w-4" />} label="Circle" onClick={() => runCmd("CIRCLE")} />
              <Tool icon={<RectangleHorizontal className="h-4 w-4" />} label="Rectangle" onClick={() => runCmd("RECT")} />
              <Tool icon={<Slash className="h-4 w-4" />} label="Arc" onClick={() => runCmd("ARC")} />
            </Group>

            {/* Group 5: Measurement */}
            <Group label="Measure">
              <Tool icon={<Ruler className="h-4 w-4" />} label="Distance" onClick={() => runCmd("MEASURE_DIST")} />
              <Tool icon={<Square className="h-4 w-4" />} label="Area" onClick={() => runCmd("MEASURE_AREA")} />
              <Tool icon={<Circle className="h-4 w-4" />} label="Radius" onClick={() => runCmd("MEASURE_RADIUS")} />
              <Tool icon={<Compass className="h-4 w-4" />} label="Angle" onClick={() => runCmd("MEASURE_ANGLE")} />
            </Group>

            {/* Group 6: History */}
            <Group label="History">
              <Tool icon={<Undo className="h-4 w-4" />} label="Undo" onClick={() => runCmd("UNDO")} />
              <Tool icon={<Redo className="h-4 w-4" />} label="Redo" onClick={() => runCmd("REDO")} />
            </Group>

            <div className="flex-1" />

            {/* Group 7: Actions */}
            <Group label="Actions">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="xs" className="h-8 gap-1.5 px-3 border-border hover:bg-muted" onClick={() => setExportOpen(true)}>
                    <Download className="h-3.5 w-3.5" />
                    <span>Export</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Export drawing as DWG, DXF, or PDF</TooltipContent>
              </Tooltip>

              <Button size="xs" className="h-8 gap-1.5 px-3 bg-primary hover:bg-primary/95 text-primary-foreground shadow" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save</span>
              </Button>
            </Group>
          </div>

          {/* MAIN CANVAS CONTAINER */}
          <div className="flex flex-1 overflow-hidden">
            <div className="relative flex-1 overflow-hidden">
              <ViewerHost
                revision={activeRev}
                editable
                bgTheme={bgTheme}
                onDirtyChange={setDirty}
                registerCommandRunner={(r) => (runCmdRef.current = r)}
                registerSaveHandler={(h) => (saveRef.current = h)}
                registerExportHandler={(h) => (exportRef.current = h)}
                registerCanvasSnapshot={(s) => (snapshotRef.current = s)}
              />
            </div>
          </div>

          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            drawing={d}
            revision={activeRev}
            projectName={project?.name ?? ""}
            getDxf={() => Promise.resolve(exportRef.current ? exportRef.current() : null).then((r) => r ?? null)}
            snapshotCanvas={() => snapshotRef.current?.() ?? null}
          />
        </div>
      </TooltipProvider>
    );
  }

  return (
    <AppShell projectId={projectId} hideHeader>
      <div className="flex h-screen flex-col">
        <header className="border-b border-border bg-card">
          <div className="flex items-center gap-4 px-6 py-3">
            <Button asChild variant="ghost" size="sm">
              <Link to="/projects/$projectId" params={{ projectId }}>
                <ArrowLeft className="mr-2 h-4 w-4" />Register
              </Link>
            </Button>
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <span className="font-mono text-xs text-muted-foreground">{d.sheetNo}</span>
                <h1 className="text-base font-semibold">{d.title}</h1>
                {activeRev && <StatusPill status={activeRev.status} />}
                <Badge variant="outline" className="font-mono text-xs">{activeRev?.format ?? d.format}</Badge>
                <Badge variant="outline" className="font-mono text-xs">{activeRev?.rev ?? d.currentRev}</Badge>
              </div>
              <div className="mt-0.5 text-xs text-muted-foreground">
                {d.discipline} · Updated {new Date(d.updatedAt).toLocaleString()}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {activeRev && activeRev.status !== "superseded" && (
                <Button asChild size="sm">
                  <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId }} search={{ mode: "edit" }}>
                    Edit
                  </Link>
                </Button>
              )}
              {activeRev?.status === "draft" && (
                <Button size="sm" variant="outline" onClick={submitReview}>
                  <ClipboardCheck className="mr-2 h-4 w-4" />Submit for review
                </Button>
              )}
              {activeRev?.status === "under_review" && (
                <Button size="sm" onClick={approve}>
                  <Check className="mr-2 h-4 w-4" />Approve
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={!activeRev}>
                <Download className="mr-2 h-4 w-4" />Export
              </Button>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          <div className="flex-1 relative">
            {activeRev ? (
              <ViewerHost
                revision={activeRev}
                editable={false}
                bgTheme={bgTheme}
                registerCommandRunner={(r) => (runCmdRef.current = r)}
                registerSaveHandler={(h) => (saveRef.current = h)}
                registerExportHandler={(h) => (exportRef.current = h)}
                registerCanvasSnapshot={(s) => (snapshotRef.current = s)}
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No revision yet — upload a file to start.
              </div>
            )}
          </div>

          <aside className="w-80 overflow-y-auto border-l border-border bg-card">
            <Tabs defaultValue="history" className="w-full">
              <TabsList className="grid w-full grid-cols-3 rounded-none border-b border-border">
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="props">Properties</TabsTrigger>
                <TabsTrigger value="qr">QR</TabsTrigger>
              </TabsList>

              <TabsContent value="history" className="p-3">
                <Card className="border-border">
                  <CardHeader className="py-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <GitBranch className="h-3.5 w-3.5" />Revisions ({revisions.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 pt-0">
                    {[...revisions].reverse().map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveRevId(v.id)}
                        className={
                          "block w-full border-l-2 pl-3 text-left transition " +
                          (v.id === activeRevId ? "border-primary" : "border-border hover:border-primary/40")
                        }
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-semibold">{v.rev}</span>
                          <StatusPill status={v.status} />
                          {v.id === d.currentRevisionId && <Badge variant="outline" className="text-[10px]">Current</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-foreground/80">{v.changeLog}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {v.createdBy} · {new Date(v.createdAt).toLocaleDateString()}
                        </p>
                        {v.approvedBy && <p className="mt-1 text-xs text-primary">Approved by {v.approvedBy}</p>}
                      </button>
                    ))}
                    {activeRev && activeRev.status === "approved" && activeRev.id !== d.currentRevisionId && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full"
                        onClick={async () => {
                          await setCurrentRevision(drawingId, activeRev.id);
                          await qc.invalidateQueries({ queryKey: ["drawing", drawingId] });
                          await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                        }}
                      >Set as current</Button>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="props" className="p-3 space-y-2 text-sm">
                <PropRow label="Sheet" value={d.sheetNo} />
                <PropRow label="Title" value={d.title} />
                <PropRow label="Discipline" value={d.discipline} />
                <PropRow label="Folder" value={d.folder} />
                <PropRow label="Format" value={activeRev?.format ?? d.format} />
                <PropRow label="Revision" value={activeRev?.rev ?? d.currentRev} />
                <PropRow label="Status" value={(activeRev?.status ?? "draft").replace("_", " ")} />
                {activeRev?.approvedBy && <PropRow label="Approved by" value={activeRev.approvedBy} />}
                {activeRev?.approvedAt && <PropRow label="Approved" value={new Date(activeRev.approvedAt).toLocaleDateString()} />}
                <PropRow label="Last updated" value={new Date(d.updatedAt).toLocaleDateString()} />
              </TabsContent>

              <TabsContent value="qr" className="p-3">
                <QrSection
                  projectId={projectId}
                  drawingId={drawingId}
                  revisionId={activeRev?.id}
                  sheetNo={d.sheetNo}
                  title={d.title}
                  rev={activeRev?.rev ?? d.currentRev}
                />
              </TabsContent>
            </Tabs>
          </aside>
        </div>

        {activeRev && (
          <ExportDialog
            open={exportOpen}
            onOpenChange={setExportOpen}
            drawing={d}
            revision={activeRev}
            projectName={project?.name ?? ""}
            getDxf={() => Promise.resolve(exportRef.current ? exportRef.current() : null).then((r) => r ?? null)}
            snapshotCanvas={() => snapshotRef.current?.() ?? null}
          />
        )}
      </div>
    </AppShell>
  );
}

function Sep() {
  return <div className="mx-1 h-6 w-px bg-border/60" />;
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3.5 border-r border-border/80 last:border-r-0 h-full justify-center">
      <div className="flex items-center gap-1.5">{children}</div>
      <span className="text-[8px] font-bold text-muted-foreground/75 uppercase tracking-wider leading-none select-none">{label}</span>
    </div>
  );
}

function Tool({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClick}
          className="h-8 w-8 p-0 hover:bg-muted hover:text-foreground hover:scale-105 active:scale-95 transition-all duration-100"
          aria-label={label}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function PropRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function QrSection({ projectId, drawingId, revisionId, sheetNo, title, rev }: { projectId: string; drawingId: string; revisionId?: string; sheetNo: string; title: string; rev: string }) {
  const { data: project } = useSuspenseQuery({ queryKey: ["project", projectId], queryFn: () => getProject(projectId) });
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Scanning this code verifies whether the printed sheet is still the latest approved revision.
      </p>
      <QrBadge
        drawingId={drawingId}
        revisionId={revisionId}
        sheetNo={sheetNo}
        title={title}
        projectName={project?.name ?? ""}
        rev={rev}
      />
    </div>
  );
}
