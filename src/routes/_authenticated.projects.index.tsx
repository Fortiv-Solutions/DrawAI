import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState, useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, PopoverAnchor } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listProjects, listDrawings, deleteProject } from "@/repositories";
import type { ProjectType } from "@/domain";
import { toast } from "sonner";
import {
  Plus, FolderKanban, Trash2, ArrowRight, Search, SlidersHorizontal, FileText,
  Building2, MapPin, Calendar, Layers, Settings, AlertCircle, LayoutGrid,
  List, TableProperties, Download, Upload, Clock, User, X, ChevronLeft,
  ChevronRight, Sparkles, Sliders, RefreshCw, FileBarChart2, ShieldCheck,
  CheckCircle2, HardDrive, ArrowUpDown
} from "lucide-react";

const projectsQuery = {
  queryKey: ["projects"] as const,
  queryFn: async () => {
    const ps = await listProjects();
    return Promise.all(
      ps.map(async (p) => {
        const drawings = await listDrawings(p.id);
        return { ...p, drawingCount: drawings.length, drawings };
      }),
    );
  },
};

export const Route = createFileRoute("/_authenticated/projects/")({
  head: () => ({
    meta: [
      { title: "Workspace Projects — DrawSync Enterprise" },
      { name: "description", content: "Enterprise project management and drawing control register." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectsQuery),
  component: ProjectsIndex,
});

type ViewMode = "grid" | "list" | "table";
type ProjectStatus = "Active" | "Completed" | "Archived" | "On Hold";
type Discipline = "Architecture" | "Structural" | "MEP" | "Civil";

// Interface for enriched project details
interface EnrichedProject {
  id: string;
  name: string;
  type: ProjectType;
  location: string;
  description?: string;
  updatedAt: string;
  drawingCount: number;
  drawings: any[];
  // Mocked/Enriched Enterprise attributes
  projectCode: string;
  client: string;
  status: ProjectStatus;
  progress: number;
  openIssues: number;
  teamMembersCount: number;
  pendingReviewsCount: number;
  recentActivity: {
    time: string;
    description: string;
    engineer: string;
  };
}

function ProjectsIndex() {
  const { data: rawProjects } = useSuspenseQuery(projectsQuery);
  const qc = useQueryClient();
  const navigate = useNavigate();
  
  // UI States
  const [viewMode, setViewMode] = useState<ViewMode>("grid");
  const [search, setSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([
    "Metro Hub", "A-101", "Foundation Details", "MEP Clash"
  ]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 6;

  // Filter States
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "All">("All");
  const [typeFilter, setTypeFilter] = useState<ProjectType | "All">("All");
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | "All">("All");
  const [sortBy, setSortBy] = useState<"updated" | "created" | "name" | "progress" | "issues">("updated");

  // Keyboard shortcut listener for Search (Ctrl + K or /)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey && e.key === "k") || e.key === "/") {
        e.preventDefault();
        const searchInput = document.getElementById("global-project-search");
        searchInput?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Enrich project list with enterprise attributes
  const enrichedProjects: EnrichedProject[] = useMemo(() => {
    const codes = ["PRJ-2026-A", "PRJ-2026-B", "PRJ-2026-C", "PRJ-2026-D", "PRJ-2026-E"];
    const clients = ["Metropolitan Transit Authority", "Apex Development Group", "Urban Redevelopment Corp", "Global Logistics Partners"];
    const statuses: ProjectStatus[] = ["Active", "Completed", "On Hold", "Archived"];
    const activities = [
      { time: "30 minutes ago", description: "Rev 12 approved", engineer: "Rahul Shah" },
      { time: "2 hours ago", description: "3 new drawings uploaded", engineer: "Sarah Chen" },
      { time: "1 day ago", description: "MEP clash issue resolved", engineer: "John Smith" },
      { time: "3 days ago", description: "Structural ledger updated", engineer: "David Miller" }
    ];

    return rawProjects.map((p, index) => {
      // Deterministic mock generation based on project ID/index
      const code = codes[index % codes.length];
      const client = clients[index % clients.length];
      const status = index === 0 ? "Active" : statuses[index % statuses.length];
      const progress = index === 0 ? 82 : Math.max(30, Math.min(100, 100 - (index * 15)));
      const openIssues = index === 0 ? 2 : (index % 3);
      const teamCount = 8 + (index * 3);
      const pendingCount = index === 0 ? 3 : (index % 4);
      const activity = activities[index % activities.length];

      return {
        ...p,
        projectCode: code,
        client,
        status,
        progress,
        openIssues,
        teamMembersCount: teamCount,
        pendingReviewsCount: pendingCount,
        recentActivity: activity
      };
    });
  }, [rawProjects]);

  // Global Multi-field Search
  const filtered = useMemo(() => {
    let list = enrichedProjects;

    // Apply Status Filter
    if (statusFilter !== "All") {
      list = list.filter(p => p.status === statusFilter);
    }

    // Apply Type Filter
    if (typeFilter !== "All") {
      list = list.filter(p => p.type === typeFilter);
    }

    // Apply Discipline Filter
    if (disciplineFilter !== "All") {
      // Match drawings containing the selected discipline
      list = list.filter(p => {
        if (p.drawings.length === 0) return false;
        return p.drawings.some((d: any) => d.discipline === disciplineFilter);
      });
    }

    // Apply Search Query
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(p => {
        const matchesProject = 
          p.name.toLowerCase().includes(q) ||
          p.projectCode.toLowerCase().includes(q) ||
          p.client.toLowerCase().includes(q) ||
          p.location.toLowerCase().includes(q) ||
          p.type.toLowerCase().includes(q);

        const matchesDrawings = p.drawings.some((d: any) => 
          d.sheetNo.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          d.discipline.toLowerCase().includes(q) ||
          d.currentRev?.toLowerCase().includes(q)
        );

        return matchesProject || matchesDrawings;
      });
    }

    // Apply Sorting
    list = [...list].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "progress") return b.progress - a.progress;
      if (sortBy === "issues") return b.openIssues - a.openIssues;
      if (sortBy === "created") return b.id.localeCompare(a.id); // fallback to ID
      return b.updatedAt.localeCompare(a.updatedAt); // default recently updated
    });

    return list;
  }, [enrichedProjects, statusFilter, typeFilter, disciplineFilter, search, sortBy]);

  // Pagination Math
  const totalPages = Math.ceil(filtered.length / itemsPerPage);
  const paginatedList = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filtered.slice(start, start + itemsPerPage);
  }, [filtered, currentPage]);

  // Overall Workspace Summary Stats
  const stats = useMemo(() => {
    const active = enrichedProjects.filter(p => p.status === "Active").length;
    const archived = enrichedProjects.filter(p => p.status === "Archived").length;
    const totalDrawings = enrichedProjects.reduce((sum, p) => sum + p.drawingCount, 0);
    const teamMembers = enrichedProjects.reduce((sum, p) => sum + p.teamMembersCount, 0);
    const pendingReviews = enrichedProjects.reduce((sum, p) => sum + p.pendingReviewsCount, 0);
    const openIssues = enrichedProjects.reduce((sum, p) => sum + p.openIssues, 0);

    return { active, archived, totalDrawings, teamMembers, pendingReviews, openIssues };
  }, [enrichedProjects]);

  const handleSearchSelect = (term: string) => {
    setSearch(term);
    setSearchFocused(false);
    if (!recentSearches.includes(term)) {
      setRecentSearches(prev => [term, ...prev.slice(0, 4)]);
    }
  };

  const clearSearch = () => {
    setSearch("");
  };

  async function remove(id: string) {
    if (!confirm("Delete this project and ALL its drawings and revisions? This cannot be undone.")) return;
    setDeletingId(id);
    await deleteProject(id);
    await qc.invalidateQueries({ queryKey: ["projects"] });
    setDeletingId(null);
    toast.success("Project deleted successfully");
  }

  const triggerExport = () => {
    toast.success("Project registry ledger exported successfully.");
  };

  const triggerImport = () => {
    toast.info("Select project backup package (.zip / .json) to import.");
  };

  return (
    <AppShell>
      {/* PREMIUM ENTERPRISE HEADER */}
      <div className="border-b border-border bg-card shadow-sm select-none">
        <div className="px-8 py-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FolderKanban className="h-3.5 w-3.5" />
                <span>Enterprise Project Registry</span>
              </div>
              <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-foreground">Projects</h1>
              <p className="mt-1 text-sm text-muted-foreground font-medium">
                Workspace coordination deck, document control compliance, and active drawings ledger.
              </p>
            </div>

            {/* Header Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <CreateProjectDialog
                trigger={
                  <Button size="sm" className="gap-1.5 shadow font-semibold text-xs h-9">
                    <Plus className="h-4 w-4" />
                    <span>New Project</span>
                  </Button>
                }
              />
              <Button variant="outline" size="sm" className="gap-1.5 border-border bg-card h-9 font-semibold text-xs" title="View settings">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span>Settings</span>
              </Button>
            </div>
          </div>

          {/* WORKSPACE SUMMARY CARDS */}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 pt-2">
            <SummaryCard label="Active Projects" value={stats.active} icon={<Building2 className="h-4 w-4 text-primary" />} />
            <SummaryCard label="Archived Projects" value={stats.archived} icon={<HardDrive className="h-4 w-4 text-stone-500" />} />
            <SummaryCard label="Total Drawings" value={stats.totalDrawings} icon={<Layers className="h-4 w-4 text-indigo-500" />} />
            <SummaryCard label="Team Members" value={stats.teamMembers} icon={<User className="h-4 w-4 text-emerald-500" />} />
            <SummaryCard label="Pending Reviews" value={stats.pendingReviews} icon={<Clock className="h-4 w-4 text-amber-500" />} alert={stats.pendingReviews > 0} />
            <SummaryCard label="Open Issues" value={stats.openIssues} icon={<AlertCircle className="h-4 w-4 text-destructive" />} alert={stats.openIssues > 0} />
          </div>
        </div>
      </div>

      {/* WORKSPACE CONTROLS & FILTER BAR */}
      <div className="bg-muted/10 min-h-screen p-8 space-y-6">
        <div className="flex flex-col gap-4 bg-card border border-border rounded-lg p-4 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Search + Filter Group */}
            <div className="flex items-center gap-2 flex-1 min-w-[280px] max-w-md">
              {/* Simple Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="global-project-search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects, drawings, sheet no..."
                  className="pl-9 pr-9 h-9 bg-muted/20 border-border text-xs focus-visible:ring-1 focus-visible:ring-primary"
                />
                {search && (
                  <button onClick={clearSearch} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Filter Dropdown Menu Triggered by Icon */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" className="h-9 w-9 border-border bg-muted/20 shrink-0 hover:bg-muted/40 transition-colors" title="Filters">
                    <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75">Project Status</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {["All", "Active", "Completed", "On Hold", "Archived"].map((status) => (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={statusFilter === status}
                      onCheckedChange={() => setStatusFilter(status as any)}
                      className="text-xs font-medium"
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground/75">Sort By</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {[
                    { value: "updated", label: "Recently Updated" },
                    { value: "created", label: "Recently Created" },
                    { value: "name", label: "Project Name" },
                    { value: "issues", label: "Open Issues" }
                  ].map((item) => (
                    <DropdownMenuCheckboxItem
                      key={item.value}
                      checked={sortBy === item.value}
                      onCheckedChange={() => setSortBy(item.value as any)}
                      className="text-xs font-medium"
                    >
                      {item.label}
                    </DropdownMenuCheckboxItem>
                  ))}
                  {(statusFilter !== "All" || search) && (
                    <>
                      <DropdownMenuSeparator />
                      <button
                        type="button"
                        onClick={() => {
                          setStatusFilter("All");
                          setSearch("");
                        }}
                        className="w-full text-center py-1.5 text-xs font-bold text-destructive hover:bg-destructive/5 transition-colors rounded-b-sm"
                      >
                        Clear Filters
                      </button>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* View Mode Switcher (Grid / List only) */}
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5 border border-border bg-muted/30 p-0.5 rounded-md">
                <Button
                  variant={viewMode === "grid" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded"
                  onClick={() => setViewMode("grid")}
                  title="Grid View"
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "list" ? "secondary" : "ghost"}
                  size="icon"
                  className="h-8 w-8 rounded"
                  onClick={() => setViewMode("list")}
                  title="Compact List"
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* PROJECTS CONTAINER */}
        {viewMode === "grid" && (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {paginatedList.map((p) => (
              <ProjectGridCard key={p.id} project={p} onDelete={remove} deleting={deletingId === p.id} />
            ))}
          </div>
        )}

        {viewMode === "list" && (
          <div className="space-y-4">
            {paginatedList.map((p) => (
              <ProjectListCard key={p.id} project={p} onDelete={remove} deleting={deletingId === p.id} />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <Card className="border-dashed border-border bg-transparent">
            <CardContent className="p-12 text-center text-sm text-muted-foreground font-medium">
              No projects found matching the current search parameters.
            </CardContent>
          </Card>
        )}

        {/* PAGINATION FOOTER */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border/60 pt-4 select-none">
            <span className="text-xs text-muted-foreground font-medium">
              Showing <span className="font-bold text-foreground">{(currentPage - 1) * itemsPerPage + 1}</span> to{" "}
              <span className="font-bold text-foreground">
                {Math.min(currentPage * itemsPerPage, filtered.length)}
              </span>{" "}
              of <span className="font-bold text-foreground">{filtered.length}</span> projects
            </span>

            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border hover:bg-muted"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              {Array.from({ length: totalPages }).map((_, idx) => (
                <Button
                  key={idx}
                  variant={currentPage === idx + 1 ? "secondary" : "ghost"}
                  size="sm"
                  className="h-8 w-8 font-semibold text-xs rounded"
                  onClick={() => setCurrentPage(idx + 1)}
                >
                  {idx + 1}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 border-border hover:bg-muted"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}

// Workspace Summary Card
function SummaryCard({ label, value, icon, alert }: { label: string; value: number; icon: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg p-3 flex items-center justify-between gap-3 shadow-xs hover:shadow-sm transition-all ${alert ? "border-amber-500/20 bg-amber-500/[0.02]" : "border-border"}`}>
      <div className="space-y-1 min-w-0">
        <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider block truncate">{label}</span>
        <span className="text-xl font-bold font-mono text-foreground leading-none">{value}</span>
      </div>
      <div className="p-1.5 bg-muted/40 rounded border border-border/40 shrink-0">{icon}</div>
    </div>
  );
}// Grid View Project Card
function ProjectGridCard({ project }: { project: EnrichedProject; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <Card className="hover:shadow-md hover:border-primary/35 border-border bg-card transition-all group flex flex-col justify-between">
      <CardContent className="p-5 space-y-4 flex-1 flex flex-col justify-between">
        <div className="space-y-3.5">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8.5 w-8.5 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <Building2 className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-[9px] font-bold bg-muted border border-border/50 px-1.5 py-0.5 rounded text-muted-foreground/80 shrink-0">
                    {project.projectCode}
                  </span>
                  <Link to="/projects/$projectId" params={{ projectId: project.id }} className="font-bold text-sm text-foreground hover:underline truncate block">
                    {project.name}
                  </Link>
                </div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5 font-semibold">
                  <MapPin className="h-3 w-3 text-muted-foreground/70" />
                  <span className="truncate">{project.location}</span>
                </div>
              </div>
            </div>
            <Badge variant="outline" className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${
              project.status === "Active"
                ? "bg-emerald-500/5 text-emerald-600 border-emerald-500/20"
                : project.status === "Completed"
                ? "bg-blue-500/5 text-blue-600 border-blue-500/20"
                : project.status === "On Hold"
                ? "bg-amber-500/5 text-amber-600 border-amber-500/20"
                : "bg-stone-500/5 text-stone-600 border-stone-500/20"
            }`}>
              {project.status}
            </Badge>
          </div>
        </div>

        {/* Recent Activity Log Box */}
        <div className="bg-muted/35 border border-border/50 rounded-md p-2.5 text-[11px] space-y-1">
          <div className="flex items-center justify-between text-[9px] font-bold uppercase text-muted-foreground/75 tracking-wider">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Recent Activity
            </span>
            <span>{project.recentActivity.time}</span>
          </div>
          <p className="font-semibold text-foreground truncate">{project.recentActivity.description}</p>
          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
            <User className="h-3 w-3" />
            <span>Engineer: {project.recentActivity.engineer}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="pt-2">
          <Button asChild variant="secondary" size="xs" className="w-full justify-between h-8 text-[11px] font-bold">
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              <span>Open Project</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// Compact List View Project Card
function ProjectListCard({ project, onDelete, deleting }: { project: EnrichedProject; onDelete: (id: string) => void; deleting: boolean }) {
  return (
    <Card className="hover:shadow-sm hover:border-primary/35 border-border bg-card transition-all group p-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Info Left */}
        <div className="flex items-center gap-3.5 min-w-0 flex-1">
          <div className="h-9 w-9 rounded bg-primary/10 text-primary flex items-center justify-center shrink-0">
            <Building2 className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-[9px] font-bold bg-muted border border-border/60 px-1.5 py-0.5 rounded text-muted-foreground">
                {project.projectCode}
              </span>
              <Link to="/projects/$projectId" params={{ projectId: project.id }} className="font-bold text-sm text-foreground hover:underline truncate">
                {project.name}
              </Link>
              <Badge variant="outline" className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0">
                {project.type}
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-4 font-semibold">
              <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{project.location}</span>
              <span>·</span>
              <span>Client: <strong className="text-foreground font-bold">{project.client}</strong></span>
              <span>·</span>
              <span className="flex items-center gap-1"><Layers className="h-3.5 w-3.5" />{project.drawingCount} drawings</span>
            </div>
          </div>
        </div>

        {/* Activity Middle */}
        <div className="flex items-center gap-4 shrink-0">
          <div className="text-left text-[11px] min-w-[180px]">
            <div className="text-[9px] font-bold uppercase text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              <span>{project.recentActivity.time}</span>
            </div>
            <p className="font-semibold text-foreground truncate max-w-[180px]">{project.recentActivity.description}</p>
          </div>

          {/* Progress */}
          <div className="w-20 space-y-1">
            <div className="flex justify-between text-[9px] font-bold text-muted-foreground">
              <span>PROGRESS</span>
              <span>{project.progress}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1 overflow-hidden">
              <div className="bg-primary h-full" style={{ width: `${project.progress}%` }} />
            </div>
          </div>
        </div>

        {/* Actions Right */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button asChild variant="secondary" size="xs" className="h-8 px-3 text-xs font-semibold gap-1">
            <Link to="/projects/$projectId" params={{ projectId: project.id }}>
              <span>Open</span>
              <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
          <Button asChild variant="ghost" size="icon" className="h-8 w-8 border border-border/60 hover:bg-muted">
            <Link to="/projects/$projectId/settings" params={{ projectId: project.id }}>
              <Settings className="h-3.5 w-3.5 text-muted-foreground" />
            </Link>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(project.id)}
            disabled={deleting}
            className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 border border-border/60"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
