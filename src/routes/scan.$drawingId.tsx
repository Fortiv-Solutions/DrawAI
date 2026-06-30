import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { resolveScanRevision } from "@/repositories";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, QrCode } from "lucide-react";

const scanQuery = (id: string) => ({
  queryKey: ["scan", id] as const,
  queryFn: async () => {
    const r = await resolveScanRevision(id);
    if (!r) throw notFound();
    return r;
  },
});

export const Route = createFileRoute("/scan/$drawingId")({
  head: ({ params }) => ({
    meta: [
      { title: `Sheet ${params.drawingId} — DrawAI` },
      { name: "description", content: "QR scan field verification — current revision check." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(scanQuery(params.drawingId)),
  notFoundComponent: () => (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center">
      <AlertTriangle className="h-10 w-10 text-destructive" />
      <h1 className="text-lg font-semibold">Drawing not found</h1>
      <p className="text-sm text-muted-foreground">This QR code doesn't match any drawing in the system.</p>
    </div>
  ),
  component: ScanPage,
});

function ScanPage() {
  const { drawingId } = Route.useParams();
  const { data } = useSuspenseQuery(scanQuery(drawingId));
  const { drawing: d, revision } = data;

  const isApproved = revision?.status === "approved";
  const noApproved = !revision || revision.status !== "approved";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-sidebar text-sidebar-foreground">
        <div className="mx-auto flex max-w-md items-center gap-2 px-6 py-4">
          <QrCode className="h-5 w-5 text-sidebar-primary" />
          <span className="text-sm font-semibold">DrawAI Field Verification</span>
        </div>
      </header>

      <main className="mx-auto max-w-md space-y-5 px-6 py-8">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {d.sheetNo} · {d.discipline}
          </div>
          <h1 className="mt-2 text-xl font-semibold">{d.title}</h1>
          <div className="mt-1 text-sm text-muted-foreground">
            Format {revision?.format ?? d.format} · Revision {revision?.rev ?? "—"}
          </div>
        </div>

        {isApproved && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-primary" />
              <div>
                <h2 className="font-semibold text-primary">Current approved revision</h2>
                <p className="mt-1 text-sm text-foreground/80">
                  Latest approved revision {revision.rev}. Safe to execute against.
                </p>
              </div>
            </div>
          </div>
        )}

        {noApproved && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <h2 className="font-semibold text-destructive">No approved revision</h2>
                <p className="mt-1 text-sm text-foreground/80">
                  This drawing has not been approved yet. Do not execute against it until it is marked approved.
                </p>
              </div>
            </div>
          </div>
        )}

        {revision && (
          <div>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">Latest change</h3>
            <div className="rounded-xl border border-border bg-card p-4 text-sm">
              <div className="font-mono text-xs text-muted-foreground">{revision.rev}</div>
              <p className="mt-1">{revision.changeLog}</p>
            </div>
          </div>
        )}

        <Button asChild size="lg" className="w-full">
          <Link to="/projects/$projectId/drawings/$drawingId" params={{ projectId: d.projectId, drawingId: d.id }}>
            Open in viewer
          </Link>
        </Button>

        <p className="text-center text-xs text-muted-foreground">DrawAI keeps teams in sync — from design to site.</p>
      </main>
    </div>
  );
}
