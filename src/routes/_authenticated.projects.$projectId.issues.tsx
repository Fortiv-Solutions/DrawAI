import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { AppShell } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { listIssues, listDrawings, createIssue, updateIssueStatus } from "@/repositories";
import type { IssueStatus } from "@/domain";
import { Search, MessageSquare, Plus } from "lucide-react";

const issuesQuery = (id: string) => ({ queryKey: ["issues", id] as const, queryFn: () => listIssues(id) });
const drawingsQuery = (id: string) => ({ queryKey: ["drawings", id] as const, queryFn: () => listDrawings(id) });

export const Route = createFileRoute("/_authenticated/projects/$projectId/issues")({
  head: () => ({ meta: [{ title: "Issues — DrawAI" }, { name: "description", content: "Track issues and markups across the project." }] }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(issuesQuery(params.projectId)),
      context.queryClient.ensureQueryData(drawingsQuery(params.projectId)),
    ]);
  },
  component: IssuesPage,
});

const STATUS_LABEL: Record<IssueStatus, string> = {
  open: "Open", in_progress: "In progress", resolved: "Resolved", closed: "Closed",
};
function statusClasses(s: IssueStatus): string {
  switch (s) {
    case "open": return "bg-destructive/15 text-destructive";
    case "in_progress": return "bg-accent/30 text-accent-foreground";
    case "resolved": return "bg-primary/15 text-primary";
    case "closed": return "bg-muted text-muted-foreground";
  }
}

function IssuesPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const { data: issues } = useSuspenseQuery(issuesQuery(projectId));
  const { data: drawings } = useSuspenseQuery(drawingsQuery(projectId));

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<IssueStatus | "all">("all");

  const filtered = useMemo(() => {
    return issues.filter((i) => {
      if (status !== "all" && i.status !== status) return false;
      if (!search) return true;
      const q = search.toLowerCase();
      return i.title.toLowerCase().includes(q) || i.drawingTitle.toLowerCase().includes(q) || i.assignee.toLowerCase().includes(q);
    });
  }, [issues, search, status]);

  return (
    <AppShell projectId={projectId}>
      <div className="border-b border-border bg-card">
        <div className="px-8 py-6">
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="mt-1 text-sm text-muted-foreground">Every issue tied to a drawing and tracked from raise to resolution.</p>
        </div>
      </div>

      <div className="space-y-4 p-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search issues, assignee, drawing…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={(v) => setStatus(v as IssueStatus | "all")}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
          <NewIssueDialog projectId={projectId} drawings={drawings} />
        </div>

        <div className="space-y-3">
          {filtered.map((i) => (
            <div key={i.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{i.id}</span>
                    <Badge variant="secondary" className={statusClasses(i.status)}>{STATUS_LABEL[i.status]}</Badge>
                    <Badge variant="outline" className="text-xs">{i.discipline}</Badge>
                  </div>
                  <Link
                    to="/projects/$projectId/drawings/$drawingId"
                    params={{ projectId, drawingId: i.drawingId }}
                    className="mt-2 block font-medium hover:text-primary"
                  >{i.title}</Link>
                  <p className="mt-1 text-sm text-muted-foreground">{i.description}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                    <span>On <span className="font-medium text-foreground">{i.drawingTitle}</span></span>
                    <span>·</span>
                    <span>Assigned to <span className="font-medium text-foreground">{i.assignee}</span></span>
                    <span>·</span>
                    <span>Raised by {i.creator}</span>
                    <span>·</span>
                    <span>{new Date(i.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MessageSquare className="h-3.5 w-3.5" />{i.comments.length}
                  </div>
                  <Select
                    value={i.status}
                    onValueChange={async (v) => {
                      await updateIssueStatus(i.id, v as IssueStatus);
                      await qc.invalidateQueries({ queryKey: ["issues", projectId] });
                    }}
                  >
                    <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="in_progress">In progress</SelectItem>
                      <SelectItem value="resolved">Resolved</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              No issues match your filters.
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function NewIssueDialog({ projectId, drawings }: { projectId: string; drawings: Array<{ id: string; title: string; discipline: string }> }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [assignee, setAssignee] = useState("");
  const [drawingId, setDrawingId] = useState(drawings[0]?.id ?? "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !drawingId) return;
    const drawing = drawings.find((d) => d.id === drawingId);
    await createIssue({
      projectId,
      drawingId,
      title,
      description,
      assignee: assignee || "Unassigned",
      discipline: drawing?.discipline ?? "General",
    });
    setTitle(""); setDescription(""); setAssignee("");
    await qc.invalidateQueries({ queryKey: ["issues", projectId] });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={drawings.length === 0}><Plus className="mr-2 h-4 w-4" />New issue</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Raise an issue</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2"><Label>Drawing</Label>
            <Select value={drawingId} onValueChange={setDrawingId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{drawings.map((d) => <SelectItem key={d.id} value={d.id}>{d.title}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} /></div>
          <div className="space-y-2"><Label>Assignee</Label><Input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name" /></div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Create</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
