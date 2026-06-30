// First-run demo data — populates localStorage so the UI is never empty.
// Replace with API hydration when backend wires up.

import { nanoid } from "nanoid";
import { kvSet } from "@/storage/kv";
import { DEFAULT_FOLDERS, type Drawing, type Issue, type Project, type ProjectMember, type Revision } from "@/domain";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

export async function seedDemoData(): Promise<void> {
  const projects: Project[] = [
    {
      id: "p_tower_b",
      name: "Skyline Tower B",
      type: "Commercial",
      location: "Mumbai, IN",
      description: "32-storey commercial tower with podium retail.",
      createdAt: daysAgo(120),
      updatedAt: daysAgo(1),
    },
    {
      id: "p_metro_hub",
      name: "Metro Hub Interchange",
      type: "Infrastructure",
      location: "Bengaluru, IN",
      createdAt: daysAgo(180),
      updatedAt: daysAgo(2),
    },
    {
      id: "p_riverside",
      name: "Riverside Residences",
      type: "Residential",
      location: "Pune, IN",
      createdAt: daysAgo(90),
      updatedAt: daysAgo(5),
    },
  ];
  kvSet("drawai.v1.projects".replace(/^drawai\.v1\./, "").slice(0), projects);
  // simpler: use the same keys as repos:
  // We must mirror the keys used in repositories/index.ts (which include the prefix internally).
  // Re-do via the same kvSet helper:
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
      name: "S. Banerjee",
      email: "sb@drawai.com",
      role: "engineer",
      addedAt: p.createdAt,
    },
  ]);
  kvSet("members", members);

  const drawings: Drawing[] = [];
  const revisions: Revision[] = [];
  function makeDrawing(p: string, folder: string, sheet: string, title: string, disc: string, revs: Array<{ rev: string; n: number; status: Revision["status"]; log: string; daysAgo: number; approver?: string }>): void {
    const id = `d_${sheet.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
    const drawing: Drawing = {
      id,
      projectId: p,
      folder,
      baseKey: sheet.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      title,
      sheetNo: sheet,
      discipline: disc,
      format: "PDF",
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
        fileName: `${sheet} ${r.rev}.pdf`,
        format: "PDF",
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
  makeDrawing("p_tower_b", "Floor Plans", "A-101", "Level 03 — Floor Plan", "Architecture", [
    { rev: "R0", n: 0, status: "superseded", log: "Initial issue", daysAgo: 40 },
    { rev: "R1", n: 1, status: "superseded", log: "Core walls revised", daysAgo: 28 },
    { rev: "R2", n: 2, status: "superseded", log: "Door D-12 relocated", daysAgo: 14 },
    { rev: "R3", n: 3, status: "approved", log: "Window W-04 enlarged", daysAgo: 1, approver: "A. Sharma (PE)" },
  ]);
  makeDrawing("p_tower_b", "Elevations", "A-201", "North Elevation", "Architecture", [
    { rev: "R0", n: 0, status: "superseded", log: "Initial issue", daysAgo: 20 },
    { rev: "R1", n: 1, status: "under_review", log: "Cladding pattern updated", daysAgo: 3 },
  ]);
  makeDrawing("p_tower_b", "Structural", "S-301", "Foundation Plan — Block B", "Structural", [
    { rev: "R0", n: 0, status: "draft", log: "First draft", daysAgo: 6 },
  ]);
  makeDrawing("p_tower_b", "MEP", "M-101", "MEP Layout — Level 03", "MEP", [
    { rev: "R0", n: 0, status: "superseded", log: "Initial", daysAgo: 30 },
    { rev: "R1", n: 1, status: "approved", log: "Coordinated with structural beams", daysAgo: 2, approver: "R. Iyer (MEP Lead)" },
  ]);
  makeDrawing("p_metro_hub", "Working Drawings", "C-401", "Track Alignment — Sec 4", "Civil", [
    { rev: "R0", n: 0, status: "approved", log: "Initial alignment", daysAgo: 25, approver: "K. Rao" },
  ]);

  kvSet("drawings", drawings);
  kvSet("revisions", revisions);

  const issues: Issue[] = [
    {
      id: "i_001",
      projectId: "p_tower_b",
      drawingId: drawings[0].id,
      drawingTitle: drawings[0].title,
      title: "Door clash with structural beam at grid C-4",
      description: "Door D-14 swing overlaps with beam in S-301.",
      assignee: "S. Banerjee",
      creator: "Demo PM",
      status: "in_progress",
      discipline: "Architecture",
      createdAt: daysAgo(3),
      comments: [{ id: nanoid(4), author: "S. Banerjee", body: "Will resize beam or shift door.", createdAt: daysAgo(2) }],
    },
    {
      id: "i_002",
      projectId: "p_tower_b",
      drawingId: drawings[3].id,
      drawingTitle: drawings[3].title,
      title: "Duct routed through structural beam",
      description: "600x400 duct passes through beam at grid B-2.",
      assignee: "R. Iyer",
      creator: "Field Inspector",
      status: "open",
      discipline: "MEP",
      createdAt: daysAgo(1),
      comments: [],
    },
  ];
  kvSet("issues", issues);
}
