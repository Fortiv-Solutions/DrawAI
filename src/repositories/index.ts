// Single import surface for UI code. Components MUST go through this module.
// Swap implementation for an API client later without touching UI.

import { nanoid } from "nanoid";
import { kvGet, kvSet } from "@/storage/kv";
import { deleteBlob, getBlob, putBlob } from "@/storage/blobs";
import { detectRevision, nextRev } from "@/services/revisionDetector";
import {
  DEFAULT_FOLDERS,
  type Drawing,
  type DrawingFormat,
  type DrawingSummary,
  type Issue,
  type IssueComment,
  type IssueStatus,
  type Project,
  type ProjectMember,
  type ProjectType,
  type Revision,
  type Role,
  type User,
  type VersionStatus,
} from "@/domain";

// ---------- keys ----------
const K = {
  projects: "projects",
  drawings: "drawings",
  revisions: "revisions",
  issues: "issues",
  members: "members",
  folders: (projectId: string) => `folders.${projectId}`,
  currentUser: "currentUser",
  seeded: "seeded",
};

// ---------- helpers ----------
function readArr<T>(key: string): T[] {
  return kvGet<T[]>(key) ?? [];
}
function writeArr<T>(key: string, arr: T[]): void {
  kvSet(key, arr);
}
function nowIso() {
  return new Date().toISOString();
}
function detectFormat(name: string): DrawingFormat {
  const ext = name.split(".").pop()?.toUpperCase() ?? "";
  if (ext === "DWG") return "DWG";
  if (ext === "DXF") return "DXF";
  if (ext === "PDF") return "PDF";
  if (ext === "PNG") return "PNG";
  if (ext === "JPG" || ext === "JPEG") return "JPG";
  if (ext === "IFC") return "IFC";
  return "PDF";
}

function readFileWithProgress(file: File, onProgress: (pct: number) => void, signal?: AbortSignal): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      try {
        if (reader.readyState === reader.LOADING) reader.abort();
      } finally {
        reject(new DOMException("Upload canceled", "AbortError"));
      }
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener("abort", abort, { once: true });
    reader.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    reader.onload = () => {
      signal?.removeEventListener("abort", abort);
      onProgress(1);
      resolve(reader.result as ArrayBuffer);
    };
    reader.onerror = () => {
      signal?.removeEventListener("abort", abort);
      reject(reader.error ?? new Error("File read failed"));
    };
    reader.onabort = () => {
      signal?.removeEventListener("abort", abort);
      reject(new DOMException("Upload canceled", "AbortError"));
    };
    reader.readAsArrayBuffer(file);
  });
}

// ========== current user ==========
const DEFAULT_USER: User = {
  id: "u_1",
  email: "demo@drawai.com",
  name: "Demo PM",
  role: "pm",
};
export function getCurrentUser(): User {
  return kvGet<User>(K.currentUser) ?? DEFAULT_USER;
}

// ========== projects ==========
export async function listProjects(): Promise<Project[]> {
  await ensureSeeded();
  return readArr<Project>(K.projects).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function getProject(id: string): Promise<Project | undefined> {
  await ensureSeeded();
  return readArr<Project>(K.projects).find((p) => p.id === id);
}
export async function createProject(input: {
  name: string;
  type: ProjectType;
  location: string;
  description?: string;
}): Promise<Project> {
  const id = `p_${nanoid(8)}`;
  const project: Project = {
    id,
    name: input.name,
    type: input.type,
    location: input.location,
    description: input.description,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  const all = readArr<Project>(K.projects);
  all.push(project);
  writeArr(K.projects, all);
  // initialize default folders
  writeArr(K.folders(id), [...DEFAULT_FOLDERS]);
  // creator as admin member
  const u = getCurrentUser();
  const members = readArr<ProjectMember>(K.members);
  members.push({
    id: nanoid(8),
    projectId: id,
    userId: u.id,
    name: u.name,
    email: u.email,
    role: "admin",
    addedAt: nowIso(),
  });
  writeArr(K.members, members);
  return project;
}
export async function updateProject(id: string, patch: Partial<Omit<Project, "id" | "createdAt">>): Promise<void> {
  const all = readArr<Project>(K.projects);
  const i = all.findIndex((p) => p.id === id);
  if (i < 0) return;
  all[i] = { ...all[i], ...patch, updatedAt: nowIso() };
  writeArr(K.projects, all);
}
export async function deleteProject(id: string): Promise<void> {
  writeArr(K.projects, readArr<Project>(K.projects).filter((p) => p.id !== id));
  // cascade
  const drawings = readArr<Drawing>(K.drawings).filter((d) => d.projectId === id);
  for (const d of drawings) await deleteDrawing(d.id);
  writeArr(K.members, readArr<ProjectMember>(K.members).filter((m) => m.projectId !== id));
}

export async function projectStats(projectId: string) {
  const drawings = await listDrawings(projectId);
  const issues = await listIssues(projectId);
  return {
    drawingCount: drawings.length,
    openIssues: issues.filter((i) => i.status === "open" || i.status === "in_progress").length,
  };
}

// ========== folders ==========
export async function listFolders(projectId: string): Promise<string[]> {
  await ensureSeeded();
  return kvGet<string[]>(K.folders(projectId)) ?? [...DEFAULT_FOLDERS];
}
export async function addFolder(projectId: string, name: string): Promise<void> {
  const folders = await listFolders(projectId);
  if (!folders.includes(name)) {
    folders.push(name);
    writeArr(K.folders(projectId), folders);
  }
}
export async function renameFolder(projectId: string, from: string, to: string): Promise<void> {
  const folders = await listFolders(projectId);
  const i = folders.indexOf(from);
  if (i >= 0) {
    folders[i] = to;
    writeArr(K.folders(projectId), folders);
  }
  const drawings = readArr<Drawing>(K.drawings);
  for (const d of drawings) if (d.projectId === projectId && d.folder === from) d.folder = to;
  writeArr(K.drawings, drawings);
}
export async function deleteFolder(projectId: string, name: string): Promise<void> {
  const folders = (await listFolders(projectId)).filter((f) => f !== name);
  writeArr(K.folders(projectId), folders);
  const drawings = readArr<Drawing>(K.drawings);
  for (const d of drawings) if (d.projectId === projectId && d.folder === name) d.folder = "Uncategorized";
  writeArr(K.drawings, drawings);
}

// ========== members ==========
export async function listMembers(projectId: string): Promise<ProjectMember[]> {
  return readArr<ProjectMember>(K.members).filter((m) => m.projectId === projectId);
}
export async function addMember(projectId: string, input: { name: string; email: string; role: Role }): Promise<ProjectMember> {
  const m: ProjectMember = {
    id: nanoid(8),
    projectId,
    userId: `u_${nanoid(6)}`,
    name: input.name,
    email: input.email,
    role: input.role,
    addedAt: nowIso(),
  };
  const all = readArr<ProjectMember>(K.members);
  all.push(m);
  writeArr(K.members, all);
  return m;
}
export async function updateMemberRole(memberId: string, role: Role): Promise<void> {
  const all = readArr<ProjectMember>(K.members);
  const i = all.findIndex((m) => m.id === memberId);
  if (i >= 0) {
    all[i].role = role;
    writeArr(K.members, all);
  }
}
export async function removeMember(memberId: string): Promise<void> {
  writeArr(K.members, readArr<ProjectMember>(K.members).filter((m) => m.id !== memberId));
}

// ========== drawings + revisions ==========
function toSummary(d: Drawing, revisions: Revision[]): DrawingSummary {
  const my = revisions.filter((r) => r.drawingId === d.id);
  const current = my.find((r) => r.id === d.currentRevisionId) ?? my[my.length - 1];
  return {
    ...d,
    currentRev: current?.rev ?? "—",
    status: current?.status ?? "draft",
    revisionCount: my.length,
  };
}

export async function listDrawings(projectId: string): Promise<DrawingSummary[]> {
  await ensureSeeded();
  const all = readArr<Drawing>(K.drawings).filter((d) => d.projectId === projectId);
  const revisions = readArr<Revision>(K.revisions);
  return all
    .map((d) => toSummary(d, revisions))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDrawing(id: string): Promise<DrawingSummary | undefined> {
  await ensureSeeded();
  const d = readArr<Drawing>(K.drawings).find((x) => x.id === id);
  if (!d) return undefined;
  return toSummary(d, readArr<Revision>(K.revisions));
}

export async function listRevisions(drawingId: string): Promise<Revision[]> {
  return readArr<Revision>(K.revisions)
    .filter((r) => r.drawingId === drawingId)
    .sort((a, b) => a.revNumber - b.revNumber);
}

export async function getRevision(revisionId: string): Promise<Revision | undefined> {
  return readArr<Revision>(K.revisions).find((r) => r.id === revisionId);
}

/** Upload a file: detect base key, create drawing OR append revision. */
export async function importDrawingFile(input: {
  projectId: string;
  folder: string;
  file: File;
  discipline?: string;
  changeLog?: string;
  /** Progress 0..1 — read+persist combined. Called multiple times. */
  onProgress?: (pct: number) => void;
  signal?: AbortSignal;
}): Promise<{ drawing: Drawing; revision: Revision; createdNewDrawing: boolean }> {
  const det = detectRevision(input.file.name);
  const format = detectFormat(input.file.name);
  const drawings = readArr<Drawing>(K.drawings);
  const revisions = readArr<Revision>(K.revisions);
  const u = getCurrentUser();

  let drawing = drawings.find(
    (d) => d.projectId === input.projectId && d.baseKey === det.baseKey && d.folder === input.folder,
  );
  let createdNewDrawing = false;
  if (!drawing) {
    drawing = {
      id: `d_${nanoid(8)}`,
      projectId: input.projectId,
      folder: input.folder,
      baseKey: det.baseKey,
      title: det.sheetNo,
      sheetNo: det.sheetNo,
      discipline: input.discipline ?? "Architecture",
      format,
      currentRevisionId: "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    drawings.push(drawing);
    createdNewDrawing = true;
  }

  const existingNumbers = revisions.filter((r) => r.drawingId === drawing!.id).map((r) => r.revNumber);
  const ord = existingNumbers.includes(det.revNumber)
    ? nextRev(existingNumbers)
    : { revNumber: det.revNumber, rev: det.rev };

  // Supersede previous revisions
  for (const r of revisions) {
    if (r.drawingId === drawing.id && r.status === "approved") r.status = "superseded";
  }

  // Stream the file through FileReader so we get real progress for big DWGs.
  input.onProgress?.(0);
  if (input.signal?.aborted) throw new DOMException("Upload canceled", "AbortError");
  const buffer = await readFileWithProgress(input.file, (p) => {
    // Read phase = 0 → 0.9; reserve the last 10% for IndexedDB persist.
    input.onProgress?.(p * 0.9);
  }, input.signal);
  if (input.signal?.aborted) throw new DOMException("Upload canceled", "AbortError");
  if (buffer.byteLength === 0) {
    throw new Error("The file appears to be empty or unreadable.");
  }

  const blobKey = `${drawing.id}/${nanoid(10)}`;
  await putBlob(blobKey, new Blob([buffer], { type: input.file.type || "application/octet-stream" }));
  if (input.signal?.aborted) {
    await deleteBlob(blobKey);
    throw new DOMException("Upload canceled", "AbortError");
  }
  input.onProgress?.(1);

  const revision: Revision = {
    id: `r_${nanoid(8)}`,
    drawingId: drawing.id,
    rev: ord.rev,
    revNumber: ord.revNumber,
    status: "draft",
    changeLog: input.changeLog ?? (createdNewDrawing ? "Initial issue" : `Revision ${ord.rev} uploaded`),
    fileName: input.file.name,
    format,
    sizeBytes: input.file.size,
    blobKey,
    createdBy: u.name,
    createdAt: nowIso(),
  };
  revisions.push(revision);

  drawing.currentRevisionId = revision.id;
  drawing.format = format;
  drawing.updatedAt = nowIso();

  writeArr(K.drawings, drawings);
  writeArr(K.revisions, revisions);
  await updateProject(drawing.projectId, {});

  return { drawing, revision, createdNewDrawing };
}

/** Overwrite the blob of a draft revision (in-viewer save). */
export async function saveRevisionBlob(revisionId: string, blob: Blob, fileName?: string): Promise<void> {
  const revisions = readArr<Revision>(K.revisions);
  const r = revisions.find((x) => x.id === revisionId);
  if (!r) throw new Error("Revision not found");
  await putBlob(r.blobKey, blob);
  r.sizeBytes = blob.size;
  if (fileName) {
    r.fileName = fileName;
    r.format = detectFormat(fileName);
  }
  writeArr(K.revisions, revisions);
  // bump drawing updatedAt
  const drawings = readArr<Drawing>(K.drawings);
  const d = drawings.find((x) => x.id === r.drawingId);
  if (d) {
    if (d.currentRevisionId === r.id) d.format = r.format;
    d.updatedAt = nowIso();
    writeArr(K.drawings, drawings);
  }
}

export async function setRevisionStatus(revisionId: string, status: VersionStatus): Promise<void> {
  const revisions = readArr<Revision>(K.revisions);
  const r = revisions.find((x) => x.id === revisionId);
  if (!r) return;
  const u = getCurrentUser();
  if (status === "approved") {
    for (const x of revisions) if (x.drawingId === r.drawingId && x.status === "approved") x.status = "superseded";
    r.approvedBy = u.name;
    r.approvedAt = nowIso();
    const drawings = readArr<Drawing>(K.drawings);
    const d = drawings.find((x) => x.id === r.drawingId);
    if (d) {
      d.currentRevisionId = r.id;
      d.updatedAt = nowIso();
      writeArr(K.drawings, drawings);
    }
  }
  r.status = status;
  writeArr(K.revisions, revisions);
}

export async function setCurrentRevision(drawingId: string, revisionId: string): Promise<void> {
  const drawings = readArr<Drawing>(K.drawings);
  const d = drawings.find((x) => x.id === drawingId);
  if (!d) return;
  d.currentRevisionId = revisionId;
  d.updatedAt = nowIso();
  writeArr(K.drawings, drawings);
}

export async function deleteDrawing(drawingId: string): Promise<void> {
  const revisions = readArr<Revision>(K.revisions);
  const mine = revisions.filter((r) => r.drawingId === drawingId);
  for (const r of mine) await deleteBlob(r.blobKey);
  writeArr(K.revisions, revisions.filter((r) => r.drawingId !== drawingId));
  writeArr(K.drawings, readArr<Drawing>(K.drawings).filter((d) => d.id !== drawingId));
  writeArr(K.issues, readArr<Issue>(K.issues).filter((i) => i.drawingId !== drawingId));
}

/** Resolve the latest APPROVED revision for QR scan; falls back to current. */
export async function resolveScanRevision(drawingId: string): Promise<{ drawing: DrawingSummary; revision: Revision | null } | null> {
  const drawing = await getDrawing(drawingId);
  if (!drawing) return null;
  const revs = await listRevisions(drawingId);
  const approved = [...revs].reverse().find((r) => r.status === "approved");
  return { drawing, revision: approved ?? revs.find((r) => r.id === drawing.currentRevisionId) ?? null };
}

export async function getRevisionBlob(revisionId: string): Promise<Blob | null> {
  const r = await getRevision(revisionId);
  if (!r) return null;
  const local = await getBlob(r.blobKey);
  if (local) return local;

  // Fallback: If not in local DB, fetch from public assets (useful for demo files and cross-device QR scanning)
  if (typeof window !== "undefined") {
    try {
      const assetUrl = "/" + encodeURIComponent(r.fileName);
      const res = await fetch(assetUrl);
      if (res.ok) {
        const b = await res.blob();
        await putBlob(r.blobKey, b);
        return b;
      }
    } catch (e) {
      console.warn("Failed to fetch seeded drawing from public folder:", e);
    }
  }
  return null;
}

// ========== issues ==========
export async function listIssues(projectId: string): Promise<Issue[]> {
  await ensureSeeded();
  return readArr<Issue>(K.issues)
    .filter((i) => i.projectId === projectId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function createIssue(input: {
  projectId: string;
  drawingId: string;
  title: string;
  description: string;
  assignee: string;
  discipline: string;
}): Promise<Issue> {
  const u = getCurrentUser();
  const drawing = await getDrawing(input.drawingId);
  const issue: Issue = {
    id: `i_${nanoid(6)}`,
    projectId: input.projectId,
    drawingId: input.drawingId,
    drawingTitle: drawing?.title ?? input.drawingId,
    title: input.title,
    description: input.description,
    assignee: input.assignee,
    creator: u.name,
    status: "open",
    discipline: input.discipline,
    createdAt: nowIso(),
    comments: [],
  };
  const all = readArr<Issue>(K.issues);
  all.push(issue);
  writeArr(K.issues, all);
  return issue;
}

export async function updateIssueStatus(id: string, status: IssueStatus): Promise<void> {
  const all = readArr<Issue>(K.issues);
  const i = all.findIndex((x) => x.id === id);
  if (i >= 0) {
    all[i].status = status;
    writeArr(K.issues, all);
  }
}

export async function addIssueComment(issueId: string, body: string): Promise<IssueComment> {
  const u = getCurrentUser();
  const c: IssueComment = { id: nanoid(6), author: u.name, body, createdAt: nowIso() };
  const all = readArr<Issue>(K.issues);
  const i = all.findIndex((x) => x.id === issueId);
  if (i >= 0) {
    all[i].comments.push(c);
    writeArr(K.issues, all);
  }
  return c;
}

// ========== seed ==========
let seeding: Promise<void> | null = null;
export async function ensureSeeded(): Promise<void> {
  if (typeof window === "undefined") return;
  if (kvGet<boolean>(K.seeded)) {
    // Migration: ensure old mock data cards for Skyline Tower B (p_tower_b) and Metro Hub (p_metro_hub) are deleted, and fresh Riverside DWG is loaded
    const drawings = kvGet<Drawing[]>(K.drawings) || [];
    const hasSite = drawings.some(d => d.id === "d_site_02");
    if (!hasSite) {
      // Clear key tags so it runs seedDemoData on next check or reload
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("drawai.v1." + K.projects);
        window.localStorage.removeItem("drawai.v1." + K.drawings);
        window.localStorage.removeItem("drawai.v1." + K.revisions);
        window.localStorage.removeItem("drawai.v1." + K.issues);
        window.localStorage.removeItem("drawai.v1." + K.members);
        window.localStorage.removeItem("drawai.v1." + K.seeded);
      }
      // Re-seed immediately
      const { seedDemoData } = await import("./seed");
      await seedDemoData();
      kvSet(K.seeded, true);
      return;
    }

    // Filter projects if somehow mock projects are still present
    const projects = kvGet<Project[]>(K.projects) || [];
    const hasMock = projects.some(p => p.id === "p_tower_b" || p.id === "p_metro_hub");
    if (hasMock) {
      // 1. Filter projects
      const filteredProjects = projects.filter(p => p.id !== "p_tower_b" && p.id !== "p_metro_hub");
      kvSet(K.projects, filteredProjects);

      // 2. Filter drawings
      const filteredDrawings = drawings.filter(d => d.projectId !== "p_tower_b" && d.projectId !== "p_metro_hub");
      kvSet(K.drawings, filteredDrawings);

      // 3. Filter revisions
      const revisions = kvGet<Revision[]>(K.revisions) || [];
      const filteredRevisions = revisions.filter(r => {
        const matchingDrawing = drawings.find(d => d.id === r.drawingId);
        return matchingDrawing && matchingDrawing.projectId !== "p_tower_b" && matchingDrawing.projectId !== "p_metro_hub";
      });
      kvSet(K.revisions, filteredRevisions);

      // 4. Filter issues
      const issues = kvGet<Issue[]>(K.issues) || [];
      const filteredIssues = issues.filter(i => i.projectId !== "p_tower_b" && i.projectId !== "p_metro_hub");
      kvSet(K.issues, filteredIssues);
    }
    return;
  }
  if (seeding) return seeding;
  seeding = (async () => {
    const { seedDemoData } = await import("./seed");
    await seedDemoData();
    kvSet(K.seeded, true);
  })();
  return seeding;
}

export async function resetAll(): Promise<void> {
  // For dev / Settings → Reset workspace
  for (const k of [K.projects, K.drawings, K.revisions, K.issues, K.members, K.seeded]) {
    if (typeof window !== "undefined") window.localStorage.removeItem("drawai.v1." + k);
  }
}
