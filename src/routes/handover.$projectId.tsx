import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { getProject, listDrawings } from "@/repositories";
import { QrBadge } from "@/components/qr/QrBadge";
import { FileText, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/app-shell";

const projectQuery = (id: string) => ({
  queryKey: ["project", id] as const,
  queryFn: async () => {
    const p = await getProject(id);
    if (!p) throw notFound();
    return p;
  },
});
const drawingsQuery = (id: string) => ({ queryKey: ["drawings", id] as const, queryFn: () => listDrawings(id) });

export const Route = createFileRoute("/handover/$projectId")({
  head: ({ params }) => ({
    meta: [
      { title: `Handover ${params.projectId} — DrawAI` },
      { name: "description", content: "As-built project handover. Scan to access approved drawings." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(projectQuery(params.projectId)),
      context.queryClient.ensureQueryData(drawingsQuery(params.projectId)),
    ]);
  },
  component: HandoverPage,
});

function HandoverPage() {
  const { projectId } = Route.useParams();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: drawings } = useSuspenseQuery(drawingsQuery(projectId));

  const approved = drawings.filter((d) => d.status === "approved");

  return (
    <AppShell projectId={projectId}>
      <div className="min-h-screen bg-background">
        <div className="border-b border-border bg-sidebar text-sidebar-foreground">
          <div className="mx-auto max-w-4xl px-6 py-10">
            <div className="flex items-center gap-2 text-sm text-sidebar-foreground/70">
              <ShieldCheck className="h-4 w-4 text-sidebar-primary" />As-built project handover
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight">{project.name}</h1>
            <p className="mt-1 text-sm text-sidebar-foreground/70">{project.type} · {project.location}</p>
          </div>
        </div>

        <main className="mx-auto max-w-4xl space-y-8 px-6 py-10">
          <section>
            <h2 className="mb-4 text-lg font-semibold">Approved drawings ({approved.length})</h2>
            <div className="space-y-3">
              {approved.map((d) => (
                <div key={d.id} className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto]">
                  <div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{d.title}</span>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {d.sheetNo} · {d.discipline} · {d.format} · {d.currentRev}
                    </div>
                    <Button asChild size="sm" variant="outline" className="mt-3">
                      <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId, drawingId: d.id }}>
                        Open in viewer
                      </Link>
                    </Button>
                  </div>
                  <div className="justify-self-start sm:justify-self-end">
                    <QrBadge drawingId={d.id} sheetNo={d.sheetNo} title={d.title} projectName={project.name} rev={d.currentRev} size={140} />
                  </div>
                </div>
              ))}
              {approved.length === 0 && (
                <div className="rounded-lg border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                  No approved drawings yet.
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </AppShell>
  );
}
