// Pure domain types. No I/O. Mirror these in the backend (Pydantic) later.

export type Role = "admin" | "pm" | "engineer" | "inspector" | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

export type ProjectType = "Residential" | "Commercial" | "Industrial" | "Infrastructure";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  location: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  addedAt: string;
}

export const DEFAULT_FOLDERS = [
  "Architecture",
  "Structural",
  "MEP",
  "Elevations",
  "Sections",
  "Floor Plans",
  "Details",
  "Working Drawings",
  "Uncategorized",
] as const;

export type FolderName = string;

export type VersionStatus = "draft" | "under_review" | "approved" | "superseded";

export type DrawingFormat = "PDF" | "DXF" | "DWG" | "PNG" | "JPG" | "IFC";

/** Logical drawing — has many revisions. */
export interface Drawing {
  id: string;
  projectId: string;
  folder: FolderName;
  /** Auto-detected base key (e.g. "A101") used to group revisions. */
  baseKey: string;
  title: string;
  sheetNo: string;
  discipline: string;
  format: DrawingFormat;
  /** id of the revision currently selected as "current" */
  currentRevisionId: string;
  createdAt: string;
  updatedAt: string;
}

export interface Revision {
  id: string;
  drawingId: string;
  /** Display label e.g. "R0", "R1", "Rev-02" */
  rev: string;
  /** Numeric ordinal used for sort/auto-increment */
  revNumber: number;
  status: VersionStatus;
  changeLog: string;
  fileName: string;
  format: DrawingFormat;
  sizeBytes: number;
  /** Key into fileBlobRepo (IndexedDB). */
  blobKey: string;
  createdBy: string;
  createdAt: string;
  approvedBy?: string;
  approvedAt?: string;
}

export type IssueStatus = "open" | "in_progress" | "resolved" | "closed";

export interface IssueComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface Issue {
  id: string;
  projectId: string;
  drawingId: string;
  drawingTitle: string;
  title: string;
  description: string;
  assignee: string;
  creator: string;
  status: IssueStatus;
  discipline: string;
  createdAt: string;
  comments: IssueComment[];
}

/** Computed view: drawing + denormalized current revision info. */
export interface DrawingSummary extends Drawing {
  currentRev: string;
  status: VersionStatus;
  revisionCount: number;
}
