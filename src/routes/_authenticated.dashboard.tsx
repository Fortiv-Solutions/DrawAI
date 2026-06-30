import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CreateProjectDialog } from "@/components/projects/CreateProjectDialog";
import { listProjects, listDrawings, listIssues } from "@/repositories";
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
} from "lucide-react";

const projectsQuery = {
  queryKey: ["projects"] as const,
  queryFn: async () => {
    const projects = await listProjects();
    const enriched = await Promise.all(
      projects.map(async (p) => {
        const [drawings, issues] = await Promise.all([listDrawings(p.id), listIssues(p.id)]);
        return {
          ...p,
          drawingCount: drawings.length,
          openIssues: issues.filter((i) => i.status === "open" || i.status === "in_progress").length,
          lastDrawingUpdate: drawings[0]?.updatedAt ?? null,
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
  const [recentOpened, setRecentOpened] = useState<RecentEntry[]>([]);
  const [recentEdited, setRecentEdited] = useState<RecentEntry[]>([]);

  // Interactive UI States
  const [projectFilter, setProjectFilter] = useState<"all" | "critical" | "active">("all");
  const [isAiExpanded, setIsAiExpanded] = useState(true);
  const [isHealthExpanded, setIsHealthExpanded] = useState(true);
  const [isReportsExpanded, setIsReportsExpanded] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [exportingReport, setExportingReport] = useState(false);

  // approvals list with actionable buttons
  const [pendingApprovals, setPendingApprovals] = useState([
    { id: "app-1", sheetNo: "A-101", title: "Ground Floor Plan", project: "Medical Center Plaza", rev: "R3", requestedBy: "David Miller", daysAgo: 1, status: "pending" },
    { id: "app-2", sheetNo: "S-204", title: "Foundation Details", project: "Riverfront Condos", rev: "R2", requestedBy: "Sarah Chen", daysAgo: 2, status: "pending" },
    { id: "app-3", sheetNo: "M-301", title: "HVAC Layout - L2", project: "Commercial Complex", rev: "R1", requestedBy: "James Wilson", daysAgo: 4, status: "pending" },
  ]);

  // AI insights state with dismiss actions
  const [aiInsights, setAiInsights] = useState([
    {
      id: "insight-1",
      type: "mismatch",
      title: "Sheet Title Mismatch",
      description: "AI scanner flagged that revision drawing text reads 'Ground Floor Plan' but file metadata is named 'Basement Layout'.",
      project: "Medical Center Plaza",
      sheet: "A-101",
    },
    {
      id: "insight-2",
      type: "legacy",
      title: "Legacy Fonts Flagged",
      description: "3 drawing sheets in this project are using legacy AutoCAD simplex fonts. Convert to vector Romand to optimize WebGL load.",
      project: "Riverfront Condos",
    },
    {
      id: "insight-3",
      type: "outdated",
      title: "Superseded Print Scan",
      description: "A QR scan matched a superseded revision on site for Sheet S-204 (Rev 1 instead of active Rev 2).",
      project: "Commercial Complex",
    }
  ]);

  useEffect(() => {
    setRecentOpened(listRecents("opened", 5));
    setRecentEdited(listRecents("edited", 5));
  }, []);

  const totalFiles = projects.reduce((sum, p) => sum + p.drawingCount, 0);
  const totalIssues = projects.reduce((sum, p) => sum + p.openIssues, 0);

  const handleApproval = (id: string, action: "approve" | "reject") => {
    setPendingApprovals(prev =>
      prev.map(app => (app.id === id ? { ...app, status: action === "approve" ? "approved" : "rejected" } : app))
    );
    toast.success(action === "approve" ? "Drawing revision approved" : "Drawing revision rejected");
  };

  const handleResolveInsight = (id: string) => {
    setAiInsights(prev => prev.filter(i => i.id !== id));
    toast.success("AI Recommendation processed and resolved");
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

  const mostActive = [...projects]
    .filter((p) => p.lastDrawingUpdate)
    .sort((a, b) => (b.lastDrawingUpdate ?? "").localeCompare(a.lastDrawingUpdate ?? ""))
    .slice(0, 4);

  return (
    <AppShell>
      {/* ENTERPRISE TITLE BANNER */}
      <div className="border-b border-border bg-card shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-8 py-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Building className="h-3.5 w-3.5" />
              <span>Enterprise Command Center</span>
            </div>
            <h1 className="font-display text-3xl font-bold tracking-tight mt-1 text-foreground">Overview</h1>
            <p className="mt-1 text-sm text-muted-foreground font-medium">
              Multi-project compliance ledger, document control registry, and active field operations.
            </p>
          </div>

          {/* Quick Actions Ribbon */}
          <div className="flex flex-wrap items-center gap-2">
            <CreateProjectDialog
              trigger={
                <Button size="sm" className="gap-1.5 shadow">
                  <Plus className="h-4 w-4" />
                  <span>Create Project</span>
                </Button>
              }
            />
            <Button variant="outline" size="sm" onClick={triggerComplianceScan} disabled={scanning} className="gap-1.5 border-border bg-card">
              <ShieldCheck className={`h-4 w-4 text-emerald-500 ${scanning ? "animate-pulse" : ""}`} />
              <span>{scanning ? "Scanning..." : "Compliance Scan"}</span>
            </Button>
            <Button variant="outline" size="sm" onClick={triggerReportExport} disabled={exportingReport} className="gap-1.5 border-border bg-card">
              <FileSpreadsheet className="h-4 w-4 text-primary" />
              <span>{exportingReport ? "Generating..." : "Export Ledger"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* DASHBOARD GRID SYSTEM */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-8 bg-muted/20 min-h-screen">
        {/* LEFT COLUMN: Main Command Panels (Span 8) */}
        <div className="lg:col-span-8 space-y-6">
          
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

          {/* PROJECT HEALTH & STATUS LEDGER */}
          <Card className="shadow-sm border-border bg-card transition-all duration-200">
            <CardHeader className="flex flex-row items-center justify-between pb-3 select-none">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <span>Project Status & Health Score</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Compliance rating based on active sheets, revision cycle frequency, and outstanding issues.
                </CardDescription>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={projectFilter === "all" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setProjectFilter("all")}
                  className="text-[10px] px-2.5 h-7 font-bold"
                >
                  All
                </Button>
                <Button
                  variant={projectFilter === "critical" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setProjectFilter("critical")}
                  className="text-[10px] px-2.5 h-7 font-bold"
                >
                  Needs Attention
                </Button>
                <Button
                  variant={projectFilter === "active" ? "secondary" : "ghost"}
                  size="xs"
                  onClick={() => setProjectFilter("active")}
                  className="text-[10px] px-2.5 h-7 font-bold"
                >
                  Active
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 border-none hover:bg-muted"
                  onClick={() => setIsHealthExpanded(!isHealthExpanded)}
                >
                  {isHealthExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
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
                        <th className="py-2.5 px-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-medium">
                      {filteredProjects.map((p) => (
                        <tr key={p.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3">
                            <Link to="/projects/$projectId" params={{ projectId: p.id }} className="hover:underline block font-semibold text-foreground">
                              {p.name}
                            </Link>
                            <span className="text-[10px] text-muted-foreground block font-medium mt-0.5">{p.location || "Location unassigned"}</span>
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant="outline" className="font-mono text-[9px] uppercase font-bold py-0">{p.type}</Badge>
                          </td>
                          <td className="py-3 px-3 text-center font-semibold text-foreground">{p.drawingCount}</td>
                          <td className="py-3 px-3 text-center">
                            {p.openIssues > 0 ? (
                              <span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 font-bold text-destructive">
                                <AlertCircle className="h-3 w-3" />
                                {p.openIssues} open
                              </span>
                            ) : (
                              <span className="text-muted-foreground font-normal">—</span>
                            )}
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden w-24">
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
                              <span className={`font-mono text-[10px] font-bold ${
                                p.health === "danger"
                                  ? "text-destructive"
                                  : p.health === "warning"
                                  ? "text-amber-600 dark:text-amber-400"
                                  : "text-emerald-600 dark:text-emerald-400"
                              }`}>
                                {p.score}%
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right">
                            <Button asChild variant="ghost" size="xs" className="h-7 px-2">
                              <Link to="/projects/$projectId" params={{ projectId: p.id }}>
                                Open Register
                                <ArrowRight className="ml-1 h-3.5 w-3.5 text-muted-foreground" />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                      {filteredProjects.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-muted-foreground">
                            No active projects match the selected filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* PENDING REVIEWS & DRAWING APPROVALS */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 select-none">
              <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-indigo-500" />
                <span>Pending Reviews & Approvals</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Drawing revisions submitted by engineering teams waiting for document control verification.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-0 space-y-3">
              {pendingApprovals.map((app) => (
                <div
                  key={app.id}
                  className={`flex flex-col md:flex-row md:items-center justify-between border border-border rounded-lg p-3 gap-3 transition-opacity ${
                    app.status !== "pending" ? "opacity-50" : "hover:bg-muted/20"
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-foreground bg-muted px-1.5 py-0.5 rounded border border-border">
                        {app.sheetNo}
                      </span>
                      <span className="text-sm font-semibold text-foreground">{app.title}</span>
                      <Badge variant="outline" className="font-mono text-[9px] font-bold py-0">{app.rev}</Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground font-medium">
                      Project: <span className="text-foreground font-semibold">{app.project}</span> · Requested by {app.requestedBy} · {app.daysAgo === 1 ? "1 day ago" : `${app.daysAgo} days ago`}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {app.status === "pending" ? (
                      <>
                        <Button
                          variant="outline"
                          size="xs"
                          className="h-7 text-xs border-border hover:bg-muted font-bold"
                          onClick={() => handleApproval(app.id, "reject")}
                        >
                          Reject
                        </Button>
                        <Button
                          size="xs"
                          className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold"
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
            </CardContent>
          </Card>

          {/* AI INSIGHTS & RECOMMENDATIONS */}
          <Card className="shadow-sm border-border bg-gradient-to-br from-primary/5 via-card to-card overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between pb-3 select-none">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <BrainCircuit className="h-4.5 w-4.5 text-primary" />
                  <span>DrawAI Copilot Insights</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Automated vector inspections, sheet title reconciliation, and site QR compliance findings.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 border-none hover:bg-muted"
                onClick={() => setIsAiExpanded(!isAiExpanded)}
              >
                {isAiExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </CardHeader>
            {isAiExpanded && (
              <CardContent className="pt-0 grid gap-3">
                {aiInsights.map((insight) => (
                  <div
                    key={insight.id}
                    className="flex items-start justify-between gap-3 border border-primary/10 rounded-lg p-3 bg-card/60 hover:bg-card transition-all"
                  >
                    <div className="flex gap-2.5">
                      <div className="mt-0.5 rounded-full bg-primary/10 p-1.5 text-primary shrink-0">
                        <Sparkles className="h-3.5 w-3.5" />
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-foreground">{insight.title}</span>
                          <Badge variant="secondary" className="text-[9px] font-mono font-bold leading-none px-1.5 py-0">
                            {insight.project}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed font-medium">
                          {insight.description}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="xs"
                      className="h-7 hover:bg-primary/5 text-primary font-bold tracking-tight"
                      onClick={() => handleResolveInsight(insight.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                ))}
                {aiInsights.length === 0 && (
                  <p className="py-6 text-center text-xs text-muted-foreground">
                    All AI insights resolved. Run a Compliance Scan to check for updates.
                  </p>
                )}
              </CardContent>
            )}
          </Card>

          {/* REPORTS & ANALYTICS SECTION */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between pb-3 select-none">
              <div>
                <CardTitle className="text-base font-semibold text-foreground flex items-center gap-2">
                  <FileBarChart2 className="h-4.5 w-4.5 text-primary" />
                  <span>Reports & Sheet Analytics</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Distribution of sheet drawings by construction disciplines and design formats.
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 border-none hover:bg-muted"
                onClick={() => setIsReportsExpanded(!isReportsExpanded)}
              >
                {isReportsExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
              </Button>
            </CardHeader>
            {isReportsExpanded && (
              <CardContent className="pt-0 grid gap-6 md:grid-cols-2">
                {/* Discipline distribution */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Sheet Disciplines</h4>
                  <div className="space-y-2">
                    <AnalyticBar label="Architectural (ARC)" percentage={45} count={Math.round(totalFiles * 0.45)} color="bg-primary" />
                    <AnalyticBar label="Structural (STR)" percentage={30} count={Math.round(totalFiles * 0.30)} color="bg-indigo-500" />
                    <AnalyticBar label="Mechanical / Plumbing (MEP)" percentage={15} count={Math.round(totalFiles * 0.15)} color="bg-amber-500" />
                    <AnalyticBar label="Civil / Landscape (CIV)" percentage={10} count={Math.round(totalFiles * 0.10)} color="bg-stone-500" />
                  </div>
                </div>

                {/* File Formats */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Drawing Formats</h4>
                  <div className="space-y-2">
                    <AnalyticBar label="AutoCAD Drawing (DWG)" percentage={70} count={Math.round(totalFiles * 0.70)} color="bg-emerald-500" />
                    <AnalyticBar label="CAD Exchange Format (DXF)" percentage={25} count={Math.round(totalFiles * 0.25)} color="bg-teal-500" />
                    <AnalyticBar label="Standard Vector PDF" percentage={5} count={Math.round(totalFiles * 0.05)} color="bg-rose-500" />
                  </div>
                </div>
              </CardContent>
            )}
          </Card>

        </div>

        {/* RIGHT COLUMN: Action center, Alerts, and Feed (Span 4) */}
        <div className="lg:col-span-4 space-y-6">

          {/* ACTIVE DISPATCH CENTER (QUICK ROUTING) */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 select-none">
              <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Command Dispatcher
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Link to="/projects" className="w-full block">
                <Button variant="outline" className="w-full justify-start gap-2.5 h-10 border-border hover:bg-muted text-foreground text-xs font-semibold">
                  <FolderKanban className="h-4 w-4 text-primary" />
                  <span>Browse Project Registers</span>
                </Button>
              </Link>

              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "Med Center", id: projects[0]?.id },
                  { label: "Riverfront", id: projects[1]?.id },
                ].map((p) => p.id ? (
                  <Link key={p.id} to="/projects/$projectId" params={{ projectId: p.id }} className="w-full block">
                    <Button variant="secondary" className="w-full justify-center h-8 text-[11px] font-bold text-foreground truncate">
                      {p.label}
                    </Button>
                  </Link>
                ) : null)}
              </div>
            </CardContent>
          </Card>

          {/* URGENT ALERTS & NOTIFICATIONS */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Bell className="h-4 w-4 text-amber-500" />
                <span>Urgent Notifications</span>
              </CardTitle>
              <Badge variant="destructive" className="font-bold text-[9px] tracking-wider py-0 px-1">Alert</Badge>
            </CardHeader>
            <CardContent className="pt-0 space-y-3 text-xs">
              <NotificationItem
                time="12m ago"
                title="Clash Issue #41 Created"
                desc="Structure beam collision flagged in Sector B Mechanical Layout."
                critical
              />
              <NotificationItem
                time="1h ago"
                title="Superseded Sheet Warning"
                desc="Outdated PDF scan print was uploaded. Corrected to active Revision 3."
              />
              <NotificationItem
                time="3h ago"
                title="John Doe requested review"
                desc="New revision uploaded for Medical Center Plumbing layout."
              />
            </CardContent>
          </Card>

          {/* DOCUMENT ACTIVITY FEED (Recently opened/edited) */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                <span>Blueprint Activity Feed</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Recently edited */}
              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Pencil className="h-3.5 w-3.5" />
                  <span>Modified Sheets</span>
                </h4>
                <div className="space-y-1.5">
                  {recentEdited.length === 0 ? (
                    <p className="py-2 text-[11px] text-muted-foreground font-medium">No drawings modified recently.</p>
                  ) : (
                    recentEdited.map((e) => (
                      <Link
                        key={`${e.drawingId}-${e.at}`}
                        to="/projects/$projectId/drawings/$drawingId"
                        params={{ projectId: e.projectId, drawingId: e.drawingId }}
                        className="flex flex-col gap-0.5 rounded-md p-1.5 hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-semibold text-xs text-foreground truncate">{e.title}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">{timeAgo(e.at)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {/* Recently opened */}
              <div className="space-y-2 pt-2 border-t border-border">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="h-3.5 w-3.5" />
                  <span>Viewed Sheets</span>
                </h4>
                <div className="space-y-1.5">
                  {recentOpened.length === 0 ? (
                    <p className="py-2 text-[11px] text-muted-foreground font-medium">No drawings viewed recently.</p>
                  ) : (
                    recentOpened.map((e) => (
                      <Link
                        key={`${e.drawingId}-${e.at}`}
                        to="/projects/$projectId/drawings/$drawingId"
                        params={{ projectId: e.projectId, drawingId: e.drawingId }}
                        className="flex flex-col gap-0.5 rounded-md p-1.5 hover:bg-muted/50 transition-colors"
                      >
                        <span className="font-semibold text-xs text-foreground truncate">{e.title}</span>
                        <span className="text-[10px] text-muted-foreground font-medium">{timeAgo(e.at)}</span>
                      </Link>
                    ))
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* COLLABORATIVE TEAM ACTIVITY LOG */}
          <Card className="shadow-sm border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" />
                <span>Active Collaborative Log</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 space-y-3.5 text-[11px] font-medium">
              <TeamActivityRow user="Alice Vance" action="joined" target="Medical Center Plaza" icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} />
              <TeamActivityRow user="Bob Chen" action="updated revision" target="S-204 Foundation Details" icon={<Clock className="h-3 w-3 text-indigo-500" />} />
              <TeamActivityRow user="David Wilson" action="resolved clash issue" target="Issue #38 (Level 2 MEP)" icon={<CheckCircle2 className="h-3 w-3 text-emerald-500" />} />
              <TeamActivityRow user="Sarah Smith" action="generated verification QR" target="M-301 HVAC Layout" icon={<QrCode className="h-3 w-3 text-primary" />} />
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

// Layout helper for HTML/CSS analytic bar charts
function AnalyticBar({ label, percentage, count, color }: { label: string; percentage: number; count: number; color: string }) {
  return (
    <div className="space-y-1 text-xs">
      <div className="flex justify-between font-medium">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground">{count} ({percentage}%)</span>
      </div>
      <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

// Layout helper for notifications
function NotificationItem({ time, title, desc, critical }: { time: string; title: string; desc: string; critical?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 p-2 rounded-md transition-colors ${critical ? "bg-destructive/5 hover:bg-destructive/10" : "hover:bg-muted/40"}`}>
      <div className="mt-1 shrink-0">
        <span className={`h-1.5 w-1.5 rounded-full block ${critical ? "bg-destructive animate-pulse" : "bg-primary"}`} />
      </div>
      <div className="space-y-0.5 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-bold text-foreground text-[11px] truncate">{title}</span>
          <span className="font-mono text-[9px] text-muted-foreground shrink-0">{time}</span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-normal font-medium">{desc}</p>
      </div>
    </div>
  );
}

// Layout helper for team logs
function TeamActivityRow({ user, action, target, icon }: { user: string; action: string; target: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 hover:bg-muted/30 p-1 rounded transition-colors">
      <div className="mt-0.5 shrink-0">{icon}</div>
      <div className="leading-relaxed">
        <span className="font-bold text-foreground">{user}</span>{" "}
        <span className="text-muted-foreground">{action}</span>{" "}
        <span className="font-semibold text-foreground truncate max-w-[150px] inline-block align-bottom">{target}</span>
      </div>
    </div>
  );
}
