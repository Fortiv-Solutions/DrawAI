import { Badge } from "@/components/ui/badge";
import type { VersionStatus } from "@/domain";

export function StatusPill({ status }: { status: VersionStatus }) {
  const cfg: Record<VersionStatus, { label: string; cls: string }> = {
    draft: { label: "Draft", cls: "bg-muted text-muted-foreground" },
    under_review: { label: "Under review", cls: "bg-accent/30 text-accent-foreground" },
    approved: { label: "Approved", cls: "bg-primary/15 text-primary" },
    superseded: { label: "Superseded", cls: "bg-muted text-muted-foreground line-through" },
  };
  const { label, cls } = cfg[status];
  return <Badge className={cls} variant="secondary">{label}</Badge>;
}
