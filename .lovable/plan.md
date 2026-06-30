# DrawAI Phase 1 — Local-First Build Plan

A complete, production-shaped frontend. No backend, no DB. All state persists to **IndexedDB** (binary drawing files) + **localStorage** (small metadata). The storage layer is hidden behind a `repositories/` interface so it can be swapped for the FastAPI backend later with zero UI changes.

---

## 1. Architecture (clean separation)

```text
src/
  domain/                  Pure TS types + business rules (no I/O)
    project.ts
    drawing.ts
    revision.ts
    member.ts
    qr.ts
  storage/                 Low-level persistence adapters
    idb.ts                 IndexedDB wrapper (idb-keyval)
    localKv.ts             typed localStorage
  repositories/            UI-facing data access (swap to API later)
    projectRepo.ts
    drawingRepo.ts
    revisionRepo.ts
    memberRepo.ts
    fileBlobRepo.ts        binary DWG/PDF/image blobs in IDB
    index.ts               re-exports — single import surface
  services/                Business logic, orchestration
    revisionDetector.ts    "A101.dwg" + "A101 Rev-01.dwg" → same drawing
    qrService.ts           generate + resolve scan URLs
    fileImport.ts          accept DWG/PDF/image, route to right pipeline
    exportService.ts       DWG export via mlightcad / PDF passthrough
  viewers/                 Pluggable viewer registry (future-proof)
    types.ts               ViewerPlugin interface
    registry.ts
    DwgViewer.tsx          mlightcad/cad-simple-viewer
    PdfViewer.tsx          pdf.js
    ImageViewer.tsx
    (future: IfcViewer, ForgeViewer — registered same way)
  components/
    editor/                ribbon, layer panel, props panel, history
    projects/              cards, create/edit dialog, members table
    repository/            folder tree, upload zone, filters, sort
    qr/                    QrBadge, QrPrintSheet, ScanResolver
  routes/                  TanStack routes (existing + new)
  lib/                     utils
```

**Rule:** components never touch `storage/` or `idb`. They call `repositories/`. Swapping to FastAPI = rewriting `repositories/*` only.

---

## 2. Drawing Editor (priority #1)

**Library:** `@mlightcad/cad-simple-viewer` + `@mlightcad/data-model`.

`viewers/DwgViewer.tsx` mounts the viewer canvas, exposes a typed handle:

```ts
type DwgHandle = {
  loadFromBlob(blob: Blob): Promise<void>;
  exec(cmd: string, args?: unknown): Promise<void>;  // routes to executeCommand()
  exportDwg(): Promise<Blob>;
  exportDxf(): Promise<Blob>;
  onSelectionChange(cb: (ids: string[]) => void): () => void;
  onDirtyChange(cb: (dirty: boolean) => void): () => void;
};
```

**Ribbon → exec mapping** (wired through viewer command bus):
Select, Move, Copy, Rotate, Resize (scale), Delete, Edit Text, Properties, Zoom In/Out, Pan, Fit, Undo, Redo, Toggle Layer, Toggle Snap/Grid.

**Layer panel** reads layer list from `data-model`, toggles visibility through viewer API.

**Properties panel** uses `AcApEntityService` + `acapRunDatabaseEdit` so edits are undoable in viewer history.

**Dirty/save flow:** dirty flag from viewer → "Save" button enabled only on `draft` revisions → `exportDwg()` blob → `fileBlobRepo.put(revisionId, blob)`. Approved/Under-review revisions stay read-only (matches existing PRD rule).

**DWG export note:** mlightcad export fidelity varies; we expose both DWG and DXF download. If DWG export of a given file fails, UI falls back to DXF + warns user — no silent data loss.

---

## 3. Project Management

Routes (new):
- `/projects` — list + create
- `/projects/$projectId/settings` — edit, delete, members, roles

Components: project cards, `CreateProjectDialog`, `MembersTable`, role select (`admin | pm | engineer | inspector | viewer`). All via `projectRepo` / `memberRepo`. Permissions enforced in a single `usePermissions(projectId)` hook so route guards and button-disabled checks share one source.

---

## 4. Drawing Repository

- Folder tree (default folders per PRD: Architecture, Structural, MEP, Elevations, Details, …). User can add/rename/delete folders.
- Drag-drop **UploadZone** accepts `.dwg .dxf .pdf .png .jpg`. Files stored in IDB; metadata in `drawingRepo`.
- Search (debounced fuzzy on title + sheetNo), filters (discipline, status, format), sort (updated, sheetNo, title).

---

## 5. Revision Control (auto-detect)

`services/revisionDetector.ts`:

1. Strip extension, normalize whitespace, uppercase.
2. Regex strip trailing revision token: `/\s*[-_ ]?\b(REV|R|V|VER|VERSION)[\s-_]?(\d+)\b\s*$/i`. Also strip `(R1)`, `_v2`, `-rev-03`.
3. Compute "base key" = remaining stem.
4. On upload: if `(projectId, folder, baseKey)` already exists → push new revision; else create new drawing.
5. Detected rev number used as default; user can override in upload dialog.

Revisions are append-only. UI shows timeline; "Set current" only on `approved`. Switching revisions in viewer loads that revision's blob.

---

## 6. QR Code System

- `qrService.generate(drawingId)` → stable URL `/(/scan/$drawingId)` encoded with `qrcode` lib to a PNG data URL.
- `/scan/$drawingId` resolves to the **latest `approved` revision** at scan time (never pinned to a revision). If none approved → "No approved revision yet" screen.
- `QrPrintSheet` composites QR + sheet number + project on a **separate offscreen 2D canvas** (required — WebGL canvas can't get a 2D context).
- Field Verification + Handover routes both consume `QrBadge`.

---

## 7. Viewer Roadmap (Phase 1 only)

Registered in `viewers/registry.ts`:
- `dwg`, `dxf` → `DwgViewer`
- `pdf` → `PdfViewer` (pdf.js)
- `png`, `jpg`, `jpeg` → `ImageViewer`

Future `ifc` / `forge` plugins drop in by registering against the same `ViewerPlugin` interface — no route or shell changes.

---

## 8. Packages to add

`@mlightcad/cad-simple-viewer`, `@mlightcad/data-model`, `idb-keyval`, `qrcode`, `pdfjs-dist`, `react-dropzone`, `fuse.js`, `nanoid`.

---

## 9. Files touched

**New:** all of `src/domain/`, `src/storage/`, `src/repositories/`, `src/services/`, `src/viewers/`, editor/project/repository/qr component folders, routes `/projects.index.tsx`, `/_authenticated.projects.$projectId.settings.tsx`.

**Replaced:** viewer route swaps placeholder for `<ViewerHost drawing={...} />`. `mock-db.ts` becomes a one-time **seeder** that populates IDB on first run, then is no longer the source of truth.

**Unchanged:** routing shell, auth mock, styles, app-shell, all shadcn UI.

---

## 10. Out of scope (deferred, per PRD)

AI features (§5), voice field mode, real backend wiring, IFC viewer, Autodesk Forge, real auth, multi-user realtime sync.

---

## Technical risks acknowledged

- **DWG round-trip fidelity** with mlightcad is not 100%; DXF fallback + clear UI warning.
- **IndexedDB quota** (~hundreds of MB typical). Upload guard warns at 80% quota and blocks at 95%.
- **Revision detection** is heuristic; user can always re-parent / split via UI.
