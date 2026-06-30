import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  getProject, updateProject, deleteProject,
  listMembers, addMember, updateMemberRole, removeMember,
  listFolders, addFolder, renameFolder, deleteFolder,
} from "@/repositories";
import type { ProjectType, Role } from "@/domain";
import { ArrowLeft, Trash2, Plus } from "lucide-react";

const projectQuery = (id: string) => ({
  queryKey: ["project", id] as const,
  queryFn: async () => {
    const p = await getProject(id);
    if (!p) throw notFound();
    return p;
  },
});
const membersQuery = (id: string) => ({ queryKey: ["members", id] as const, queryFn: () => listMembers(id) });
const foldersQuery = (id: string) => ({ queryKey: ["folders", id] as const, queryFn: () => listFolders(id) });

export const Route = createFileRoute("/_authenticated/projects/$projectId/settings")({
  head: ({ params }) => ({
    meta: [{ title: `Settings — ${params.projectId} — DrawAI` }, { name: "description", content: "Project settings, members, folders." }],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(projectQuery(params.projectId)),
      context.queryClient.ensureQueryData(membersQuery(params.projectId)),
      context.queryClient.ensureQueryData(foldersQuery(params.projectId)),
    ]);
  },
  notFoundComponent: () => <div className="p-8 text-muted-foreground">Project not found.</div>,
  component: SettingsPage,
});

function SettingsPage() {
  const { projectId } = Route.useParams();
  const qc = useQueryClient();
  const router = useRouter();
  const { data: project } = useSuspenseQuery(projectQuery(projectId));
  const { data: members } = useSuspenseQuery(membersQuery(projectId));
  const { data: folders } = useSuspenseQuery(foldersQuery(projectId));

  const [name, setName] = useState(project.name);
  const [type, setType] = useState<ProjectType>(project.type);
  const [location, setLocation] = useState(project.location);
  const [description, setDescription] = useState(project.description ?? "");

  const [memberName, setMemberName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<Role>("engineer");
  const [newFolder, setNewFolder] = useState("");

  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    await updateProject(projectId, { name, type, location, description });
    await qc.invalidateQueries({ queryKey: ["project", projectId] });
    await qc.invalidateQueries({ queryKey: ["projects"] });
  }
  async function removeProject() {
    if (!confirm("Delete this project and all data?")) return;
    await deleteProject(projectId);
    await qc.invalidateQueries({ queryKey: ["projects"] });
    router.navigate({ to: "/projects" });
  }

  return (
    <AppShell projectId={projectId}>
      <div className="border-b border-border bg-card">
        <div className="flex items-center gap-3 px-8 py-5">
          <Button asChild variant="ghost" size="sm">
            <Link to="/projects/$projectId" params={{ projectId }}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to register
            </Link>
          </Button>
          <h1 className="ml-2 text-xl font-semibold tracking-tight">Project settings</h1>
        </div>
      </div>

      <div className="grid gap-6 p-8 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Project details</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={saveProject} className="space-y-4">
              <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Type</Label>
                  <Select value={type} onValueChange={(v) => setType(v as ProjectType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Residential">Residential</SelectItem>
                      <SelectItem value="Commercial">Commercial</SelectItem>
                      <SelectItem value="Industrial">Industrial</SelectItem>
                      <SelectItem value="Infrastructure">Infrastructure</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2"><Label>Location</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
              </div>
              <div className="space-y-2"><Label>Description</Label><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
              <div className="flex justify-between">
                <Button type="button" variant="destructive" onClick={removeProject}>
                  <Trash2 className="mr-2 h-4 w-4" />Delete project
                </Button>
                <Button type="submit">Save changes</Button>
              </div>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Members & roles</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead className="w-12" /></TableRow></TableHeader>
              <TableBody>
                {members.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>
                      <div>{m.name}</div>
                      <div className="text-xs text-muted-foreground">{m.email}</div>
                    </TableCell>
                    <TableCell>
                      <Select
                        value={m.role}
                        onValueChange={async (v) => {
                          await updateMemberRole(m.id, v as Role);
                          await qc.invalidateQueries({ queryKey: ["members", projectId] });
                        }}
                      >
                        <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["admin", "pm", "engineer", "inspector", "viewer"] as Role[]).map((r) => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={async () => {
                          await removeMember(m.id);
                          await qc.invalidateQueries({ queryKey: ["members", projectId] });
                        }}
                        aria-label="Remove member"
                      ><Trash2 className="h-4 w-4" /></Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!memberName.trim() || !memberEmail.trim()) return;
                await addMember(projectId, { name: memberName, email: memberEmail, role: memberRole });
                setMemberName(""); setMemberEmail("");
                await qc.invalidateQueries({ queryKey: ["members", projectId] });
              }}
              className="grid grid-cols-[1fr_1fr_auto_auto] items-end gap-2"
            >
              <div className="space-y-1"><Label className="text-xs">Name</Label><Input value={memberName} onChange={(e) => setMemberName(e.target.value)} /></div>
              <div className="space-y-1"><Label className="text-xs">Email</Label><Input value={memberEmail} onChange={(e) => setMemberEmail(e.target.value)} /></div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={memberRole} onValueChange={(v) => setMemberRole(v as Role)}>
                  <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["admin", "pm", "engineer", "inspector", "viewer"] as Role[]).map((r) => (
                      <SelectItem key={r} value={r}>{r}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button type="submit"><Plus className="h-4 w-4" /></Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Folders</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <ul className="divide-y divide-border rounded-md border border-border">
              {folders.map((f) => (
                <li key={f} className="flex items-center justify-between px-3 py-2">
                  <span className="text-sm">{f}</span>
                  <div className="flex gap-1">
                    <Button
                      variant="ghost" size="sm"
                      onClick={async () => {
                        const to = prompt("Rename folder", f);
                        if (!to || to === f) return;
                        await renameFolder(projectId, f, to);
                        await qc.invalidateQueries({ queryKey: ["folders", projectId] });
                        await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                      }}
                    >Rename</Button>
                    <Button
                      variant="ghost" size="sm"
                      onClick={async () => {
                        if (!confirm(`Delete folder "${f}"? Drawings move to Uncategorized.`)) return;
                        await deleteFolder(projectId, f);
                        await qc.invalidateQueries({ queryKey: ["folders", projectId] });
                        await qc.invalidateQueries({ queryKey: ["drawings", projectId] });
                      }}
                    ><Trash2 className="h-4 w-4" /></Button>
                  </div>
                </li>
              ))}
            </ul>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!newFolder.trim()) return;
                await addFolder(projectId, newFolder.trim());
                setNewFolder("");
                await qc.invalidateQueries({ queryKey: ["folders", projectId] });
              }}
              className="flex gap-2"
            >
              <Input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="New folder name" />
              <Button type="submit"><Plus className="mr-2 h-4 w-4" />Add</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
