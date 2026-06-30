import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import Fuse from "fuse.js";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { getProject, listDrawings, listFolders, listIssues, deleteDrawing, getRevision } from "@/repositories";
import { UploadZone } from "@/components/repository/UploadZone";
import { StatusPill } from "@/components/StatusPill";
import { exportOriginalWithQr, exportPdfWithQr } from "@/services/exportService";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator,
  DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import type { VersionStatus } from "@/domain";
import {
  Folder, Search, Upload, FileText, Trash2, Settings, ArrowUpDown,
  Eye, Pencil, MoreVertical, Download, QrCode, FileDown,
  Layers, AlertCircle, Sparkles, Plus, FileCode2, ArrowLeft
} from "lucide-react";

const projectQuery = (id: string) => ({
  queryKey: ["project", id] as const,
  queryFn: async () => {
    const p = await getProject(id);
    if (!p) throw notFound();
    return p;
  },
});
const drawingsQuery = (id: string) => ({ queryKey: ["drawings", id] as const, queryFn: () => listDrawings(id) });
const foldersQuery = (id: string) => ({ queryKey: ["folders", id] as const, queryFn: () => listFolders(id) });
const issuesQuery = (id: string) => ({ queryKey: ["issues", id] as const, queryFn: () => listIssues(id) });

export const Route = createFileRoute("/_authenticated/projects/$projectId/")({
  head: ({ params }) => ({
    meta: [
      { title: `Project Register — DrawSync` },
      { name: "description", content: "Project drawing register." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(projectQuery(params.projectId)),
      context.queryClient.ensureQueryData(drawingsQuery(params.projectId)),
      context.queryClient.ensureQueryData(foldersQuery(params.projectId)),
      context.queryClient.ensureQueryData(issuesQuery(params.projectId)),
    ]);
  },
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground font-medium">Project not found.</div>
  ),
  errorComponent: () => (
    <div className="flex min-h-screen items-center justify-center text-destructive font-medium">Failed to load project.</div>
  ),
  component: ProjectPage,
});

type SortKey = "updated" | "sheetNo" | "title";

function ProjectPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: drawings } = useSuspenseQuery(drawingsQuery(projectId));
  const { data: folders } = useSuspenseQuery(foldersQuery(projectId));
  const { data: issues } = useSuspenseQuery(issuesQuery(projectId));

  const [search, setSearch] = useState("");
  const [activeFolder, setActiveFolder] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<VersionStatus | "all">("all");
  const [sortBy, setSortBy] = useState<SortKey>("updated");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFolder, setUploadFolder] = useState<string>(folders[0] ?? "Uncategorized");

  const openIssues = issues.filter((i) => i.status === "open" || i.status === "in_progress").length;

  const fuse = useMemo(
    () => new Fuse(drawings, { keys: ["title", "sheetNo", "discipline"], threshold: 0.35 }),
    [drawings],
  );

  const filtered = useMemo(() => {
    let list = drawings;
    if (activeFolder !== "All") list = list.filter((d) => d.folder === activeFolder);
    if (statusFilter !== "all") list = list.filter((d) => d.status === statusFilter);
    if (search.trim()) list = fuse.search(search).map((r) => r.item).filter((d) => list.includes(d));
    if (sortBy === "sheetNo") list = [...list].sort((a, b) => a.sheetNo.localeCompare(b.sheetNo));
    else if (sortBy === "title") list = [...list].sort((a, b) => a.title.localeCompare(b.title));
    else list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [drawings, activeFolder, statusFilter, search, sortBy, fuse]);

  const folderCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of drawings) m[d.folder] = (m[d.folder] ?? 0) + 1;
    return m;
  }, [drawings]);

  return (
    <AppShell projectId={projectId}>
      {/* SHARP & CLEAN HEADER */}
      <div className="border-b border-border bg-card shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between px-8 py-6 gap-4">
          <div className="space-y-3">
            <Button asChild variant="ghost" size="xs" className="h-7 -ml-2.5 text-muted-foreground hover:text-foreground gap-1.5 text-xs font-bold self-start">
              <Link to="/projects">
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back to Projects</span>
              </Link>
            </Button>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
                <span>{project.type}</span>
                <span>•</span>
                <span>{project.location || "Unassigned Location"}</span>
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">{project.name}</h1>
            </div>
            <div className="flex items-center gap-3 mt-1.5 text-xs font-semibold text-muted-foreground">
              <span className="flex items-center gap-1 bg-muted px-2 py-0.5 rounded border border-border/60">
                <Layers className="h-3.5 w-3.5 text-primary" />
                {drawings.length} Drawings
              </span>
              {openIssues > 0 ? (
                <span className="flex items-center gap-1 bg-destructive/10 text-destructive px-2 py-0.5 rounded border border-destructive/20 font-bold">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {openIssues} Open Issues
                </span>
              ) : (
                <span className="flex items-center gap-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  <Sparkles className="h-3.5 w-3.5" />
                  All Clear
                </span>
              )}
            </div>
          </div>

          <Button asChild variant="outline" size="sm" className="gap-1.5 border-border bg-card self-start md:self-center">
            <Link to="/projects/$projectId/settings" params={{ projectId }}>
              <Settings className="h-4 w-4 text-muted-foreground" />
              <span>Project Settings</span>
            </Link>
          </Button>
        </div>
      </div>

      {/* TWO-COLUMN CONTENT REGISTRY */}
      <div className="grid gap-8 p-8 lg:grid-cols-[220px_1fr] bg-muted/10 min-h-screen">
        {/* SIDEBAR: FOLDERS */}
        <aside className="space-y-4">
          <div className="flex items-center justify-between select-none px-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Folders</span>
            <span className="text-[9px] font-semibold font-mono text-muted-foreground/60">{folders.length} categories</span>
          </div>
          <nav className="space-y-0.5">
            <FolderItem
              active={activeFolder === "All"}
              onClick={() => setActiveFolder("All")}
              label="All Drawings"
              count={drawings.length}
            />
            {folders.map((f) => (
              <FolderItem
                key={f}
                active={activeFolder === f}
                onClick={() => setActiveFolder(f)}
                label={f}
                count={folderCounts[f] ?? 0}
              />
            ))}
          </nav>
        </aside>

        {/* MAIN CONTENT AREA */}
        <section className="space-y-4">
          {/* SEARCH & FILTERS BAR */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[260px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by Sheet, Title, or Discipline..."
                className="pl-9 h-9 bg-card border-border shadow-xs text-xs focus-visible:ring-1 focus-visible:ring-primary"
              />
            </div>

            <div className="flex items-center gap-2">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as VersionStatus | "all")}>
                <SelectTrigger className="w-36 h-9 bg-card border-border text-xs font-semibold">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="under_review">Under Review</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="superseded">Superseded</SelectItem>
                </SelectContent>
              </Select>

              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
                <SelectTrigger className="w-44 h-9 bg-card border-border text-xs font-semibold">
                  <span className="flex items-center gap-1.5">
                    <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
                    <SelectValue placeholder="Sort order" />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="updated">Recently Updated</SelectItem>
                  <SelectItem value="sheetNo">Sheet Number</SelectItem>
                  <SelectItem value="title">Sheet Title</SelectItem>
                </SelectContent>
              </Select>

              <Sheet open={uploadOpen} onOpenChange={setUploadOpen}>
                <SheetTrigger asChild>
                  <Button
                    size="sm"
                    className="h-9 gap-1.5 shadow"
                    onClick={() => setUploadFolder(activeFolder !== "All" ? activeFolder : folders[0] ?? "Uncategorized")}
                  >
                    <Upload className="h-4 w-4" />
                    <span>Upload Sheet</span>
                  </Button>
                </SheetTrigger>
                <SheetContent className="w-[420px] sm:max-w-md">
                  <SheetHeader>
                    <SheetTitle>Upload Drawings</SheetTitle>
                    <SheetDescription>
                      Upload new drawing sheets. File names like <code>A101.dwg</code> or <code>A101 Rev-01.dwg</code> will be automatically stacked under the same sheet.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Target Folder</label>
                      <Select value={uploadFolder} onValueChange={setUploadFolder}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <UploadZone projectId={projectId} folder={uploadFolder} />
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>

          {/* DOCUMENT REGISTER TABLE */}
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <Table>
              <TableHeader className="bg-muted/30">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Sheet</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Title</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Folder</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Discipline</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Format</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3 text-center">Rev</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Status</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3 text-center">History</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3">Updated</TableHead>
                  <TableHead className="text-xs font-bold text-muted-foreground uppercase tracking-wider py-3 text-right pr-6">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((d) => (
                  <TableRow key={d.id} className="hover:bg-muted/20 transition-colors">
                    {/* Sheet Number */}
                    <TableCell className="font-mono text-xs font-semibold py-3.5">
                      <Link
                        to="/projects/$projectId/drawings/$drawingId"
                        params={{ projectId, drawingId: d.id }}
                        className="flex items-center gap-2 hover:text-primary transition-colors text-foreground"
                      >
                        <FileText className="h-4 w-4 text-muted-foreground/75 shrink-0" />
                        <span>{d.sheetNo}</span>
                      </Link>
                    </TableCell>

                    {/* Title */}
                    <TableCell className="font-semibold text-foreground py-3.5 max-w-[220px] truncate">{d.title}</TableCell>

                    {/* Folder */}
                    <TableCell className="text-xs text-muted-foreground py-3.5">{d.folder}</TableCell>

                    {/* Discipline */}
                    <TableCell className="text-xs text-foreground font-medium py-3.5">{d.discipline}</TableCell>

                    {/* Format */}
                    <TableCell className="py-3.5">
                      <span className="font-mono text-[10px] font-bold uppercase tracking-wider bg-muted/60 px-1.5 py-0.5 rounded border border-border/40 text-muted-foreground">
                        {d.format}
                      </span>
                    </TableCell>

                    {/* Current Revision */}
                    <TableCell className="font-mono text-xs text-center py-3.5">{d.currentRev}</TableCell>

                    {/* Status */}
                    <TableCell className="py-3.5">
                      <StatusPill status={d.status} />
                    </TableCell>

                    {/* Revisions Count */}
                    <TableCell className="text-xs text-center font-semibold text-muted-foreground py-3.5">
                      {d.revisionCount} {d.revisionCount === 1 ? "rev" : "revs"}
                    </TableCell>

                    {/* Updated At */}
                    <TableCell className="text-xs text-muted-foreground py-3.5">
                      {new Date(d.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                    </TableCell>

                    {/* Action Menu */}
                    <TableCell className="py-3.5 text-right pr-6">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" title="View Drawing">
                          <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId: d.id }} search={{ mode: "view" } as never}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Link>
                        </Button>
                        <Button asChild variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" title="Edit Drawing">
                          <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId: d.id }} search={{ mode: "edit" } as never}>
                            <Pencil className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          </Link>
                        </Button>
                        
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-muted" aria-label="More actions">
                              <MoreVertical className="h-4 w-4 text-muted-foreground" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem asChild>
                              <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId: d.id }} search={{ mode: "view" } as never}>
                                <Eye className="mr-2 h-4 w-4 text-muted-foreground" /> View Register
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId: d.id }} search={{ mode: "edit" } as never}>
                                <Pencil className="mr-2 h-4 w-4 text-muted-foreground" /> Edit Drawing
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <Download className="mr-2 h-4 w-4 text-muted-foreground" /> Export Document
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent className="w-60">
                                <DropdownMenuItem
                                  onSelect={async (e) => {
                                    e.preventDefault();
                                    try {
                                      const rev = await getRevision(d.currentRevisionId);
                                      if (!rev) throw new Error("Current revision is missing.");
                                      await exportOriginalWithQr(d, rev);
                                      toast.success(`Exported ${d.sheetNo} (${d.format}) + QR`);
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : "Export failed");
                                    }
                                  }}
                                >
                                  <FileCode2 className="mr-2 h-4 w-4 text-muted-foreground" />
                                  Original ({d.format}) + QR
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onSelect={async (e) => {
                                    e.preventDefault();
                                    try {
                                      const rev = await getRevision(d.currentRevisionId);
                                      if (!rev) throw new Error("Current revision is missing.");
                                      await exportPdfWithQr(d, rev, project.name);
                                      toast.success(`Exported ${d.sheetNo} as PDF with QR`);
                                    } catch (err) {
                                      toast.error(err instanceof Error ? err.message : "Export failed");
                                    }
                                  }}
                                >
                                  <FileDown className="mr-2 h-4 w-4 text-muted-foreground" />
                                  PDF with QR stamp
                                </DropdownMenuItem>
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive font-semibold"
                              onSelect={async (e) => {
                                e.preventDefault();
                                if (!confirm(`Delete ${d.sheetNo} and all its revisions?`)) return;
                                await deleteDrawing(d.id);
                                await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                                toast.success(`Deleted ${d.sheetNo}`);
                              }}
                            >
                              <Trash2 className="mr-2 h-4 w-4" /> Delete Sheet
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="py-12 text-center text-sm text-muted-foreground">
                      No drawings match your filters.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

// Sidebar Folder Item
function FolderItem({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center justify-between rounded-md px-3 py-2 text-xs transition font-semibold " +
        (active
          ? "bg-primary/10 text-primary border-l-2 border-primary rounded-l-none pl-2.5"
          : "text-foreground/75 hover:bg-muted hover:text-foreground")
      }
    >
      <span className="flex items-center gap-2 truncate">
        <Folder className={`h-3.5 w-3.5 ${active ? "text-primary" : "text-muted-foreground/75"}`} />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[10px] text-muted-foreground/85 bg-muted px-1.5 py-0.5 rounded-full border border-border/40 font-mono">
        {count}
      </span>
    </button>
  );
}
