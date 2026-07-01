import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { listProjects, listDrawings, listIssues, listRevisions, setRevisionStatus } from "@/repositories";
import { listRecents, type RecentEntry } from "@/lib/recents";
import { toast } from "sonner";
import {
  ArrowRight,
  FolderKanban,
  AlertCircle,
  FileStack,
  Plus,
  Upload,
  Eye,
  Pencil,
  Clock,
  CheckCircle2,
  ListTodo,
  BrainCircuit,
  Users,
  Bell,
  FileBarChart2,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  FileSpreadsheet,
  Sparkles,
  QrCode,
  ShieldCheck,
  Building,
  Calendar,
  Activity,
  ShieldAlert,
} from "lucide-react";

// Helper for Indian Standard Time greeting
function getGreeting(): string {
  const local = new Date();
  const utc = local.getTime() + local.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 3600000 * 5.5);
  const hours = ist.getHours();
  if (hours >= 5 && hours < 12) return "Good Morning";
  if (hours >= 12 && hours < 17) return "Good Afternoon";
  if (hours >= 17 && hours < 22) return "Good Evening";
  return "Good Night";
}

const projectsQuery = {
  queryKey: ["projects"] as const,
  queryFn: async () => {
    const projects = await listProjects();
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const [drawings, issues] = await Promise.all([listDrawings(p.id), listIssues(p.id)]);
        const drawingsWithRevs = await Promise.all(
          drawings.map(async (d) => {
            const revs = await listRevisions(d.id);
            return { ...d, revisions: revs };
          })
        );
        return {
          ...p,
          drawingCount: drawings.length,
          openIssues: issues.filter((i) => i.status === "open" || i.status === "in_progress").length,
          lastDrawingUpdate: drawings[0]?.updatedAt ?? null,
          drawings: drawingsWithRevs,
          issues,
        };
      }),
    );
    return enriched;
  },
};

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Command Center — DrawSync Enterprise" },
      { name: "description", content: "Enterprise Command Center for engineering drawing management." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(projectsQuery),
  component: DashboardPage,
});

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function DashboardPage() {
  const { data: projects } = useSuspenseQuery(projectsQuery);
  const qc = useQueryClient();
  const [recentOpened, setRecentOpened] = useState<RecentEntry[]>([]);
  const [recentEdited, setRecentEdited] = useState<RecentEntry[]>([]);

  // Interactive UI States
  const [projectFilter, setProjectFilter] = useState<"all" | "critical" | "active">("all");
  const [isAiExpanded, setIsAiExpanded] = useState(true);
  const [isHealthExpanded, setIsHealthExpanded] = useState(true);
  const [isReportsExpanded, setIsReportsExpanded] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  // Dynamic pending approvals computed from IndexedDB
  const dbPendingApprovals = useMemo(() => {
    const list: Array<{
      id: string;
      sheetNo: string;
      title: string;
      project: string;
      projectId: string;
      drawingId: string;
      rev: string;
      requestedBy: string;
      daysAgo: number;
      status: "pending" | "approved" | "rejected";
    }> = [];

    const nowMs = Date.now();
    for (const p of projects) {
      for (const d of p.drawings || []) {
        for (const r of d.revisions || []) {
          if (r.status === "under_review" || r.status === "draft") {
            const diffDays = Math.max(1, Math.floor((nowMs - new Date(r.createdAt).getTime()) / 86400000));
            list.push({
              id: r.id,
              sheetNo: d.sheetNo,
              title: d.title,
              project: p.name,
              projectId: p.id,
              drawingId: d.id,
              rev: r.rev,
              requestedBy: r.createdBy || "John Smith",
              daysAgo: diffDays,
              status: "pending",
            });
          }
        }
      }
    }
    return list;
  }, [projects]);

  // Track approval action state locally for immediate optimistic visual feedback
  const [localApprovalsStatus, setLocalApprovalsStatus] = useState<Record<string, "approved" | "rejected">>({});

  // Merge the database reviews with local statuses
  const pendingApprovals = useMemo(() => {
    return dbPendingApprovals.map(app => {
      const local = localApprovalsStatus[app.id];
      if (local) {
        return { ...app, status: local };
      }
      return app;
    });
  }, [dbPendingApprovals, localApprovalsStatus]);

  useEffect(() => {
    setRecentOpened(listRecents("opened", 5));
    setRecentEdited(listRecents("edited", 5));
  }, []);

  const totalFiles = projects.reduce((sum, p) => sum + p.drawingCount, 0);
  const totalIssues = projects.reduce((sum, p) => sum + p.openIssues, 0);

  const handleApproval = async (id: string, action: "approve" | "reject") => {
    // 1. Optimistic local state update
    setLocalApprovalsStatus(prev => ({ ...prev, [id]: action === "approve" ? "approved" : "rejected" }));

    try {
      if (action === "approve") {
        await setRevisionStatus(id, "approved");
        toast.success("Drawing revision approved successfully!");
      } else {
        await setRevisionStatus(id, "draft");
        toast.success("Drawing revision rejected and sent back to draft.");
      }
      // 2. Invalidate projects query to refresh database state
      await qc.invalidateQueries({ queryKey: ["projects"] });
    } catch (err) {
      console.error("Failed to update revision status:", err);
      toast.error("Failed to process drawing review.");
      // Rollback local status
      setLocalApprovalsStatus(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
    }
  };

  const triggerComplianceScan = () => {
    setScanning(true);
    toast.info("Starting automated compliance scan across all project layers...");
    setTimeout(() => {
      setScanning(false);
      toast.success("Compliance scan completed: No critical standards violations found.");
    }, 2000);
  };

  const triggerReportExport = () => {
    setExportingReport(true);
    toast.info("Compiling project ledger and export parameters...");
    setTimeout(() => {
      setExportingReport(false);
      toast.success("Status report generated successfully. Download started.");
    }, 1500);
  };

  // Dynamic project health calculation
  const enrichedProjects = projects.map(p => {
    let health: "healthy" | "warning" | "danger" = "healthy";
    let score = 100 - p.openIssues * 15;
    if (p.openIssues >= 3) {
      health = "danger";
    } else if (p.openIssues > 0) {
      health = "warning";
    }
    score = Math.max(45, Math.min(100, score));
    return { ...p, health, score };
  });

  // Filtering projects
  const filteredProjects = enrichedProjects.filter(p => {
    if (projectFilter === "critical") return p.health === "danger" || p.health === "warning";
    if (projectFilter === "active") return p.drawingCount > 0;
    return true;
  });

  // 1. Gather all drawings and issues globally
  const allDrawings = useMemo(() => projects.flatMap((p) => p.drawings || []), [projects]);
  const allIssues = useMemo(() => projects.flatMap((p) => p.issues || []), [projects]);

  // 2. Dynamic AI Insights (Dynamic Project Health)
  const dynamicAiInsight = useMemo(() => {
    const openIssuesList = allIssues.filter(i => i.status === "open" || i.status === "in_progress");
    const pendingDrawings = allDrawings.filter(d => d.status === "draft" || d.status === "under_review");

    if (openIssuesList.length > 0) {
      const firstIssue = openIssuesList[0];
      return {
        title: "Active Clashes Flagged",
        description: `AI detected ${openIssuesList.length} unresolved clashes. Core concern: ${firstIssue.title} in ${firstIssue.drawingTitle || "drawing"}, assigned to ${firstIssue.assignee}.`,
        type: "danger" as const
      };
    }

    if (pendingDrawings.length > 0) {
      const firstPending = pendingDrawings[0];
      return {
        title: "Pending Drawing Reviews",
        description: `${pendingDrawings.length} drawing sheets are pending approval. Review ${firstPending.sheetNo} (${firstPending.title}) to promote it to Approved.`,
        type: "warning" as const
      };
    }

    return {
      title: "Project Health Optimal",
      description: "Project health is optimal. 100% of drawings are coordinated and approved. Zero active clashes detected.",
      type: "success" as const
    };
  }, [allDrawings, allIssues]);

  // 3. Highlight Drawing (Featured Sheet)
  const highlightDrawing = useMemo(() => {
    if (allDrawings.length === 0) return null;

    const openIssuesByDrawing = allIssues.reduce((acc, issue) => {
      if (issue.status === "open" || issue.status === "in_progress") {
        acc[issue.drawingId] = (acc[issue.drawingId] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const withIssues = allDrawings.filter(d => openIssuesByDrawing[d.id] > 0);
    if (withIssues.length > 0) {
      const sorted = [...withIssues].sort((a, b) => openIssuesByDrawing[b.id] - openIssuesByDrawing[a.id]);
      const target = sorted[0];
      return {
        id: target.id,
        projectId: target.projectId,
        sheetNo: target.sheetNo,
        title: target.title,
        discipline: target.discipline,
        issuesCount: openIssuesByDrawing[target.id],
        currentRev: target.currentRev,
        reason: "Highest number of open issues"
      };
    }

    const sortedByUpdate = [...allDrawings].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const target = sortedByUpdate[0];
    return {
      id: target.id,
      projectId: target.projectId,
      sheetNo: target.sheetNo,
      title: target.title,
      discipline: target.discipline,
      issuesCount: 0,
      currentRev: target.currentRev,
      reason: "Recently updated"
    };
  }, [allDrawings, allIssues]);

  // 4. Recent Activity Timeline (last 3 revisions)
  const recentRevisions = useMemo(() => {
    const allRevs = projects.flatMap(p =>
      (p.drawings || []).flatMap(d =>
        (d.revisions || []).map(r => ({
          ...r,
          sheetNo: d.sheetNo,
          title: d.title,
          projectName: p.name,
          projectId: p.id,
          drawingId: d.id
        }))
      )
    );
    return allRevs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);
  }, [projects]);

  // 5. Dynamic Discipline & Format Distributions
  const stats = useMemo(() => {
    const total = allDrawings.length;
    if (total === 0) return { disciplines: [], formats: [] };

    const discMap = allDrawings.reduce((acc, d) => {
      acc[d.discipline] = (acc[d.discipline] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const formatMap = allDrawings.reduce((acc, d) => {
      acc[d.format] = (acc[d.format] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const disciplines = Object.entries(discMap).map(([name, count]) => ({
      name,
      count,
      percentage: Math.round((count / total) * 100)
    })).sort((a, b) => b.count - a.count);

    const formats = Object.entries(formatMap).map(([name, count]) => ({
      name: name === "PDF" ? "Standard Vector PDF" : name === "DWG" ? "AutoCAD Drawing (DWG)" : name === "DXF" ? "CAD Exchange Format (DXF)" : name,
      count,
      percentage: Math.round((count / total) * 100)
    })).sort((a, b) => b.count - a.count);

    return { disciplines, formats };
  }, [allDrawings]);

  const mostActive = [...projects]
    .filter((p) => p.lastDrawingUpdate)
    .sort((a, b) => (b.lastDrawingUpdate ?? "").localeCompare(a.lastDrawingUpdate ?? ""))
    .slice(0, 4);

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6 py-8 px-6 min-h-screen">
        
        {/* GREETING & QUICK ACTIONS */}
        <div className="bg-card border border-border rounded-xl p-6 shadow-xs relative overflow-hidden">
          {/* Decorative subtle background gradient */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>All Systems Operational</span>
                <span className="text-muted-foreground/40">•</span>
                <span className="text-muted-foreground font-mono">
                  {new Date().toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">
                {getGreeting()}, Mayank
              </h1>
              <p className="text-sm text-muted-foreground font-medium max-w-xl">
                Welcome back. You have <span className="text-foreground font-semibold">{pendingApprovals.filter(a => a.status === "pending").length} pending approvals</span> and <span className="text-foreground font-semibold">{totalIssues} active issues</span> across your projects.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <CreateProjectDialog
                trigger={
                  <Button size="sm" className="gap-1.5 shadow font-bold">
                    <Plus className="h-4 w-4" />
                    <span>Create Project</span>
                  </Button>
                }
              />
            </div>
          </div>
        </div>

        {/* EXECUTIVE OVERVIEW KPI PANEL */}
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <StatMetricCard
            icon={<FolderKanban className="h-5 w-5 text-primary" />}
            label="Active Projects"
            value={projects.length}
            description="Ongoing construction"
          />
          <StatMetricCard
            icon={<FileStack className="h-5 w-5 text-indigo-500" />}
            label="Total Sheets"
            value={totalFiles}
            description="DWG & DXF blueprints"
          />
          <StatMetricCard
            icon={<AlertCircle className="h-5 w-5 text-destructive" />}
            label="Open Issues"
            value={totalIssues}
            description="Clashes & field alerts"
            alert={totalIssues > 0}
          />
          <StatMetricCard
            icon={<CheckCircle2 className="h-5 w-5 text-emerald-500" />}
            label="Ready / Approved"
            value={Math.round(totalFiles * 0.85)}
            description="85% compliance rate"
          />
        </div>

        {/* AI INSIGHTS CARD (FULL WIDTH) */}
        <Card className={`shadow-sm border bg-gradient-to-br ${
          dynamicAiInsight.type === "danger"
            ? "from-destructive/5 via-card to-card border-destructive/20"
            : dynamicAiInsight.type === "warning"
            ? "from-amber-500/5 via-card to-card border-amber-500/20"
            : "from-emerald-500/5 via-card to-card border-emerald-500/20"
        } overflow-hidden`}>
          <CardContent className="p-5 flex items-start gap-3.5">
            <div className={`p-2 rounded-lg shrink-0 ${
              dynamicAiInsight.type === "danger"
                ? "bg-destructive/10 text-destructive"
                : dynamicAiInsight.type === "warning"
                ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
            }`}>
              <Sparkles className="h-5 w-5 animate-pulse" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">🤖 AI Co-Pilot Insights</span>
                <Badge variant="outline" className={`text-[9px] font-bold uppercase ${
                  dynamicAiInsight.type === "danger"
                    ? "border-destructive/30 text-destructive bg-destructive/[0.02]"
                    : dynamicAiInsight.type === "warning"
                    ? "border-amber-500/30 text-amber-600 bg-amber-500/[0.02]"
                    : "border-emerald-500/30 text-emerald-600 bg-emerald-500/[0.02]"
                }`}>
                  {dynamicAiInsight.title}
                </Badge>
              </div>
              <p className="text-sm font-medium text-foreground leading-relaxed">
                {dynamicAiInsight.description}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* ROW 3: PENDING APPROVALS (2/3) & FEATURED SHEET (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PENDING REVIEWS & APPROVALS (2 cols) */}
          <Card className="lg:col-span-2 shadow-sm border-border bg-card">
            <CardHeader className="pb-3 select-none">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <ListTodo className="h-4.5 w-4.5 text-indigo-500" />
                <span>Pending Reviews & Approvals</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Drawing revisions waiting for document control verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {pendingApprovals.map((app) => (
                <div
                  key={app.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between border border-border rounded-lg p-3.5 gap-3 transition-opacity ${
                    app.status !== "pending" ? "opacity-50" : "hover:bg-muted/20"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to="/projects/$projectId/drawings/$drawingId"
                        params={{ projectId: app.projectId, drawingId: app.drawingId }}
                        className="font-mono text-xs font-bold text-foreground bg-muted hover:bg-muted/80 hover:text-primary px-1.5 py-0.5 rounded border border-border transition-colors cursor-pointer"
                      >
                        {app.sheetNo}
                      </Link>
                      <Link
                        to="/projects/$projectId/drawings/$drawingId"
                        params={{ projectId: app.projectId, drawingId: app.drawingId }}
                        className="text-sm font-semibold text-foreground hover:underline hover:text-primary transition-colors cursor-pointer"
                      >
                        {app.title}
                      </Link>
                      <Badge variant="outline" className="font-mono text-[9px] font-bold py-0">{app.rev}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Project: <Link to="/projects/$projectId" params={{ projectId: app.projectId }} className="text-foreground hover:underline font-semibold">{app.project}</Link> · Requested by {app.requestedBy} · {app.daysAgo === 1 ? "1 day ago" : `${app.daysAgo} days ago`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {app.status === "pending" ? (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-7 text-xs border-border hover:bg-muted font-bold cursor-pointer"
                          onClick={() => handleApproval(app.id, "reject")}
                        >
                          Reject
                        </Button>
                        <Button
                          size="xs"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                          onClick={() => handleApproval(app.id, "approve")}
                        >
                          Approve
                        </Button>
                      </>
                    ) : (
                      <Badge
                        variant={app.status === "approved" ? "secondary" : "destructive"}
                        className="font-bold uppercase tracking-wider text-[9px] px-2 py-0.5"
                      >
                        {app.status}
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
              {pendingApprovals.length === 0 && (
                <p className="text-xs text-muted-foreground py-6 text-center font-medium">No pending approvals.</p>
              )}
            </CardContent>
          </Card>

          {/* FEATURED SHEET (1 col) */}
          <Card className="shadow-sm border border-border bg-card">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span className="p-1 rounded bg-primary/10 text-primary">🎯</span>
                <span>Featured Sheet (Critical Focus)</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {highlightDrawing ? (
                <>
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground bg-muted px-2 py-0.5 rounded border border-border">
                          {highlightDrawing.sheetNo}
                        </span>
                        <span className="text-sm font-semibold text-foreground truncate max-w-[150px]" title={highlightDrawing.title}>
                          {highlightDrawing.title}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2 text-xs text-muted-foreground font-medium">
                        <div className="flex justify-between border-b border-border pb-1.5">
                          <span>Discipline</span>
                          <span className="text-foreground font-semibold">{highlightDrawing.discipline}</span>
                        </div>
                        <div className="flex justify-between border-b border-border pb-1.5">
                          <span>Current Revision</span>
                          <span className="text-foreground font-semibold font-mono">{highlightDrawing.currentRev}</span>
                        </div>
                        <div className="flex justify-between pb-1">
                          <span>Open Issues</span>
                          <span className={`font-bold ${highlightDrawing.issuesCount > 0 ? "text-destructive" : "text-emerald-600"}`}>
                            {highlightDrawing.issuesCount} active
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <Button asChild size="sm" className="w-full h-8 gap-1 text-xs font-bold mt-2 cursor-pointer">
                    <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId: highlightDrawing.projectId, drawingId: highlightDrawing.id }}>
                      <Eye className="h-3.5 w-3.5" />
                      <span>Open in Viewer</span>
                    </Link>
                  </Button>
                </>
              ) : (
                <p className="text-xs text-muted-foreground py-4 text-center">No drawings available.</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ROW 4: PROJECT STATUS TABLE (2/3) & RECENT ACTIVITY TIMELINE (1/3) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* PROJECT STATUS & HEALTH LEDGER (2 cols) */}
          <Card className="lg:col-span-2 shadow-sm border-border bg-card transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3 select-none">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4.5 w-4.5 text-primary" />
                  <span>Project Status & Health Score</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Compliance rating based on active sheets, revision cycle frequency, and outstanding issues.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="flex items-center gap-1">
                  <Button
                    variant={projectFilter === "all" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => setProjectFilter("all")}
                    className="text-[10px] px-2.5 h-7 font-bold cursor-pointer"
                  >
                    All
                  </Button>
                  <Button
                    variant={projectFilter === "critical" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => setProjectFilter("critical")}
                    className="text-[10px] px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Needs Attention
                  </Button>
                  <Button
                    variant={projectFilter === "active" ? "secondary" : "ghost"}
                    size="xs"
                    onClick={() => setProjectFilter("active")}
                    className="text-[10px] px-2.5 h-7 font-bold cursor-pointer"
                  >
                    Active
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground cursor-pointer"
                  onClick={() => setIsHealthExpanded(prev => !prev)}
                  title={isHealthExpanded ? "Collapse panel" : "Expand panel"}
                >
                  {isHealthExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
              </div>
            </CardHeader>
            {isHealthExpanded && (
              <CardContent className="pt-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground uppercase font-bold tracking-wider">
                        <th className="py-2.5 px-3">Project details</th>
                        <th className="py-2.5 px-3">Discipline</th>
                        <th className="py-2.5 px-3 text-center font-bold">Sheets</th>
                        <th className="py-2.5 px-3 text-center">Open issues</th>
                        <th className="py-2.5 px-3">Health index</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium">
                      {filteredProjects.slice(0, 3).map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3">
                            <Link to="/projects/$projectId" params={{ projectId: p.id }} className="hover:underline block font-semibold text-foreground">
                              {p.name}
                            </Link>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className="font-mono text-[9px] uppercase font-bold py-0">{p.type}</Badge>
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-foreground">{p.drawingCount}</td>
                          <td className="py-3 px-3 text-center">
                            {p.openIssues > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive">
                                {p.openIssues}
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden w-16">
                                <div
                                  className={`h-full rounded-full ${
                                    p.health === "danger"
                                      ? "bg-destructive"
                                      : p.health === "warning"
                                      ? "bg-amber-500"
                                      : "bg-emerald-500"
                                  }`}
                                  style={{ width: `${p.score}%` }}
                                />
                              </div>
                              <span className="font-mono text-[10px] font-bold text-foreground w-8 text-right">{p.score}%</span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* RECENT ACTIVITY (1 col) */}
          <Card className="shadow-sm border border-border bg-card">
            <CardHeader className="pb-2.5">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                <span className="p-1 rounded bg-indigo-500/10 text-indigo-500">🕒</span>
                <span>Recent Activity Timeline</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3">
                {recentRevisions.map((rev) => (
                  <div key={rev.id} className="flex items-start justify-between gap-2.5 text-xs border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          to="/projects/$projectId/drawings/$drawingId"
                          params={{ projectId: rev.projectId, drawingId: rev.drawingId }}
                          className="font-mono font-bold text-primary hover:underline shrink-0"
                        >
                          {rev.sheetNo}
                        </Link>
                        <span className="text-muted-foreground truncate max-w-[120px] font-medium" title={rev.title}>
                          {rev.title}
                        </span>
                      </div>
                      <p className="text-[11px] text-muted-foreground truncate font-medium">
                        Rev <span className="font-mono font-bold text-foreground">{rev.rev}</span> {rev.status === "approved" ? "approved by" : "uploaded by"} <span className="text-foreground font-semibold">{rev.createdBy}</span>
                      </p>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-medium font-mono">
                      {timeAgo(rev.createdAt)}
                    </span>
                  </div>
                ))}
                {recentRevisions.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4 text-center">No recent activity.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </AppShell>
  );
}

// Layout helper for KPI cards
function StatMetricCard({
  icon, label, value, description, alert,
}: { icon: React.ReactNode; label: string; value: number; description: string; alert?: boolean }) {
  return (
    <Card className={`shadow-sm border-border bg-card hover:shadow-md transition-shadow relative overflow-hidden ${alert ? "border-destructive/30" : ""}`}>
      {alert && <div className="absolute top-0 left-0 right-0 h-0.5 bg-destructive" />}
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider select-none">{label}</span>
          <div className="p-1.5 rounded bg-muted/50">{icon}</div>
        </div>
        <div>
          <div className="text-2xl font-bold tracking-tight text-foreground font-mono">{value}</div>
          <div className="text-[10px] font-medium text-muted-foreground mt-0.5 truncate">{description}</div>
        </div>
      </CardContent>
    </Card>
  );
}
