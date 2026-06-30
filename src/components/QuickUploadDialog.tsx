import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { UploadZone } from "@/components/repository/UploadZone";
import { listProjects, listFolders } from "@/repositories";
import { STANDARD_FOLDERS } from "@/lib/types";

interface Props {
  trigger: ReactNode;
  defaultProjectId?: string;
}

export function QuickUploadDialog({ trigger, defaultProjectId }: Props) {
  const [open, setOpen] = useState(false);
  const [projectId, setProjectId] = useState<string>(defaultProjectId ?? "");
  const [folder, setFolder] = useState<string>(STANDARD_FOLDERS[0] ?? "General");

  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: listProjects,
    enabled: open,
  });

  const { data: folders = [] } = useQuery({
    queryKey: ["folders", projectId],
    queryFn: () => listFolders(projectId),
    enabled: open && !!projectId,
  });

  useEffect(() => {
    if (!projectId && projects.length > 0) {
      setProjectId(defaultProjectId ?? projects[0].id);
    }
  }, [projects, projectId, defaultProjectId]);

  useEffect(() => {
    if (folders.length > 0 && !folders.includes(folder)) {
      setFolder(folders[0]);
    }
  }, [folders, folder]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display text-xl">Quick upload</DialogTitle>
          <DialogDescription>
            Drop a drawing into any project — revisions are detected from the file name.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Project</label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Folder</label>
            <Select value={folder} onValueChange={setFolder} disabled={!projectId}>
              <SelectTrigger>
                <SelectValue placeholder="Select folder" />
              </SelectTrigger>
              <SelectContent>
                {(folders.length ? folders : STANDARD_FOLDERS).map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {projectId ? (
          <UploadZone projectId={projectId} folder={folder} />
        ) : (
          <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Create a project first to upload drawings.
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
