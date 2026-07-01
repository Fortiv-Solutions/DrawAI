// First-run demo data — populates localStorage so the UI is never empty.
// Replace with API hydration when backend wires up.

import { nanoid } from "nanoid";
import { kvSet } from "@/storage/kv";
import { DEFAULT_FOLDERS, type Drawing, type Issue, type Project, type ProjectMember, type Revision, type DrawingFormat } from "@/domain";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

export async function seedDemoData(): Promise<void> {
  const projects: Project[] = [
    {
      id: "p_riverside",
      name: "Riverside Residences",
      type: "Residential",
      location: "Pune, IN",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(5),
    },
  ];
  kvSet("projects", projects);

  for (const p of projects) kvSet(`folders.${p.id}`, [...DEFAULT_FOLDERS]);

  const members: ProjectMember[] = projects.flatMap((p) => [
    {
      id: nanoid(8),
      projectId: p.id,
      userId: "u_1",
      name: "Demo PM",
      email: "demo@drawai.com",
      role: "admin",
      addedAt: p.createdAt,
    },
    {
      id: nanoid(8),
      projectId: p.id,
      userId: "u_2",
      name: "John Smith",
      email: "js@drawai.com",
      role: "engineer",
      addedAt: p.createdAt,
    },
  ]);
  kvSet("members", members);

  const drawings: Drawing[] = [];
  const revisions: Revision[] = [];
  function makeDrawing(
    p: string,
    folder: string,
    sheet: string,
    title: string,
    disc: string,
    format: DrawingFormat,
    fileName: string,
    revs: Array<{ rev: string; n: number; status: Revision["status"]; log: string; daysAgo: number; approver?: string }>
  ): void {
    const id = `d_${sheet.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const drawing: Drawing = {
      id,
      projectId: p,
      folder,
      baseKey: sheet.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      title,
      sheetNo: sheet,
      discipline: disc,
      format,
      currentRevisionId: "",
      createdAt: daysAgo(revs[0].daysAgo),
      updatedAt: daysAgo(revs[revs.length - 1].daysAgo),
    };
    for (const r of revs) {
      const rev: Revision = {
        id: `${id}_${r.rev.toLowerCase().replace(/[^a-z0-9]/g, "_")}`,
        drawingId: id,
        rev: r.rev,
        revNumber: r.n,
        status: r.status,
        changeLog: r.log,
        fileName: fileName,
        format,
        sizeBytes: 0,
        blobKey: `seed/${id}/${r.rev}`,
        createdBy: "Demo PM",
        createdAt: daysAgo(r.daysAgo),
        approvedBy: r.approver,
        approvedAt: r.approver ? daysAgo(r.daysAgo) : undefined,
      };
      revisions.push(rev);
      if (r.status === "approved" || r.status === "draft" || r.status === "under_review") {
        drawing.currentRevisionId = rev.id;
      }
    }
    if (!drawing.currentRevisionId) drawing.currentRevisionId = revisions[revisions.length - 1].id;
    drawings.push(drawing);
  }
  
  makeDrawing(
    "p_riverside",
    "Floor Plans",
    "SITE-01",
    "FOR SITE 16-04-2026",
    "Civil",
    "DWG",
    "FOR SITE 16-04-2026.dwg",
    [
      { rev: "R0", n: 0, status: "superseded", log: "Initial release", daysAgo: 10 },
      { rev: "R1", n: 1, status: "approved", log: "IFC approved drawings", daysAgo: 1, approver: "John Smith" },
    ]
  );

  kvSet("drawings", drawings);
  kvSet("revisions", revisions);

  const issues: Issue[] = [
    {
      id: "i_001",
      projectId: "p_riverside",
      drawingId: drawings[0].id,
      drawingTitle: drawings[0].title,
      title: "Clash at Grid A-3",
      description: "HVAC duct clash with structural beam.",
      assignee: "John Smith",
      creator: "Demo PM",
      status: "open",
      discipline: "Architecture",
      createdAt: daysAgo(3),
      comments: [],
    },
  ];
  kvSet("issues", issues);
}
