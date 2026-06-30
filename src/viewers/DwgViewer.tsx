// DWG/DXF viewer powered by @mlightcad/cad-simple-viewer.
// Client-only (uses three.js + DOM). Lazy-imported via viewers/registry.ts.

import { useEffect, useRef, useState } from "react";
import type { ViewerProps } from "./types";

const PKG_VERSION = "1.5.7";
const CDN_BASE = `https://cdn.jsdelivr.net/npm/@mlightcad/cad-simple-viewer@${PKG_VERSION}/dist`;
const CAD_DATA_BASE = "https://cdn.jsdelivr.net/gh/mlightcad/cad-data/";
// Premium background colors tailored for CAD space
// - View mode: clean, off-white slate sheet (#f8fafc)
// - Edit mode: professional dark slate workstation (#0f172a)
const VIEW_BACKGROUND = "#f8fafc";
const VIEW_BACKGROUND_HEX = 0xf8fafc;
const EDIT_BACKGROUND = "#0f172a";
const EDIT_BACKGROUND_HEX = 0x0f172a;
const PDF_EXPORT_LONG_SIDE = 2200;
const MIN_EXPORT_DRAWING_PIXELS = 150;

const workerBlobCache: Record<string, Promise<string>> = {};
function workerBlobUrl(name: string): Promise<string> {
  return (workerBlobCache[name] ||= (async () => {
    try {
      console.info(`[DwgViewer] Fetching local worker: /${name}`);
      const t0 = performance.now();
      const res = await fetch(`/${name}`);
      if (!res.ok) throw new Error(`Failed to load local worker ${name}: ${res.status}`);
      const text = await res.text();
      const blob = new Blob([text], { type: "application/javascript" });
      const blobUrl = URL.createObjectURL(blob);
      const t1 = performance.now();
      console.info(`[DwgViewer] Local worker /${name} loaded as Blob URL in ${(t1 - t0).toFixed(1)}ms`);
      return blobUrl;
    } catch (e) {
      console.error(`[DwgViewer] Failed to load local worker /${name}:`, e);
      throw e;
    }
  })());
}

let fontFetchPatched = false;
function patchCadDataFontsFetch() {
  if (fontFetchPatched || typeof window === "undefined") return;
  fontFetchPatched = true;
  const realFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url && url.includes("cad-datafonts")) {
      const file = url.split("/").pop() || "fonts.json";
      // Add cache-busting to bypass cached CORS headers
      return realFetch(`${CAD_DATA_BASE}fonts/${file}?cb=${Date.now()}`, init);
    }
    return realFetch(input as RequestInfo, init);
  }) as typeof window.fetch;
}

function makeCadColor(dataModel: any, hex: number) {
  const color = new dataModel.AcCmColor(dataModel.AcCmColorMethod?.ByColor);
  if (typeof color.setRGBValue === "function") return color.setRGBValue(hex);
  color.setRGB((hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
  return color;
}

function greyCanvasSysVars(dataModel: any, bgHex: number) {
  const vars = dataModel.AcDbSystemVariables;
  return {
    [vars.MODELBKCOLOR]: makeCadColor(dataModel, bgHex),
    [vars.PAPERBKCOLOR]: makeCadColor(dataModel, bgHex),
  };
}

function normalizeRasterLikeEntity(entity: any) {
  if (!entity || typeof entity !== "object") return;
  if (entity.type === "IMAGE") {
    entity.clippingBoundaryPath = Array.isArray(entity.clippingBoundaryPath) ? entity.clippingBoundaryPath : [];
    entity.position ??= { x: 0, y: 0, z: 0 };
    entity.imageSize ??= { x: 1, y: 1 };
    entity.uPixel ??= { x: 1, y: 0, z: 0 };
    entity.vPixel ??= { x: 0, y: 1, z: 0 };
    entity.flags ??= 3;
    entity.clipping ??= 0;
    entity.isClipped ??= false;
  }
  if (entity.type === "WIPEOUT") {
    entity.boundary = Array.isArray(entity.boundary) ? entity.boundary : [];
  }
}

function normalizeParsedCadImages(model: any) {
  const visit = (entities: any) => {
    if (Array.isArray(entities)) entities.forEach(normalizeRasterLikeEntity);
  };
  visit(model?.entities);
  Object.values(model?.blocks ?? {}).forEach((block: any) => visit(block?.entities));
  model?.tables?.BLOCK_RECORD?.entries?.forEach((record: any) => visit(record?.entities));
}

function patchRegisteredCadConverters(dataModel: any) {
  const manager = dataModel.AcDbDatabaseConverterManager?.instance;
  const fileTypes = [dataModel.AcDbFileType?.DWG, dataModel.AcDbFileType?.DXF].filter(Boolean);
  fileTypes.forEach((fileType) => {
    const converter = manager?.get?.(fileType);
    if (!converter || converter.__lovableRasterBoundaryPatch) return;
    converter.__lovableRasterBoundaryPatch = true;

    ["processEntities", "processBlocks"].forEach((method) => {
      const original = converter[method];
      if (typeof original !== "function") return;
      converter[method] = function patchedCadImageProcessing(model: any, ...args: any[]) {
        normalizeParsedCadImages(model);
        return original.call(this, model, ...args);
      };
    });
  });
}

// Only commands the engine actually registers (verified against cad-simple-viewer@1.5.7).
// Zoom subcommands (extents/in/out/window/prev/next) are NOT registered as separate
// command strings; they're keyword branches of the interactive `zoom` command. We
// implement those directly against the view API below.
const COMMAND_MAP: Record<string, string> = {
  SELECT: "select",
  PAN: "pan",
  ZOOM_WINDOW: "zoom", // engine prompts the user for two corners
  MOVE: "move",
  COPY: "copy",
  ROTATE: "rotate",
  SCALE: "scale",
  RESIZE: "scale",
  TEXT: "mtext",
  LINE: "line",
  PLINE: "pline",
  CIRCLE: "circle",
  RECT: "rectang",
  ARC: "arc",
  ERASE: "erase",
  DELETE: "erase",
  UNDO: "undo",
  REDO: "redo",
  CANCEL: "\u001b",
  MEASURE_DIST: "measuredistance",
  MEASURE_AREA: "measurearea",
  MEASURE_RADIUS: "measurearc",
  MEASURE_ANGLE: "measureangle",
  CLEAR_MEASUREMENTS: "clearmeasurements",
};

const MUTATING = new Set([
  "MOVE", "COPY", "ROTATE", "SCALE", "RESIZE",
  "TEXT", "LINE", "PLINE", "CIRCLE", "RECT", "ARC", "ERASE", "DELETE",
]);

/** Build a Box-like object accepted by view.zoomTo(box). */
function makeBox(minX: number, minY: number, maxX: number, maxY: number) {
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const w = Math.abs(maxX - minX);
  const h = Math.abs(maxY - minY);
  return {
    min: { x: minX, y: minY },
    max: { x: maxX, y: maxY },
    getSize(out: { x: number; y: number }) { out.x = w; out.y = h; return out; },
    getCenter(out: { x: number; y: number }) { out.x = cx; out.y = cy; return out; },
  };
}

function currentViewBox(view: any) {
  const a = view.screenToWorld({ x: 0, y: 0 });
  const b = view.screenToWorld({ x: view.width, y: view.height });
  const minX = Math.min(a.x, b.x), maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y), maxY = Math.max(a.y, b.y);
  return makeBox(minX, minY, maxX, maxY);
}

type FitBox = ReturnType<typeof makeBox>;

function validFitBox(minX: number, minY: number, maxX: number, maxY: number): FitBox | null {
  if (![minX, minY, maxX, maxY].every(Number.isFinite)) return null;
  let left = Math.min(minX, maxX);
  let right = Math.max(minX, maxX);
  let bottom = Math.min(minY, maxY);
  let top = Math.max(minY, maxY);
  const width = right - left;
  const height = top - bottom;
  const span = Math.max(width, height);
  if (span <= 1e-9) return null;

  // CAD spatial indexes often store horizontal/vertical line entities with a
  // zero width or zero height bbox. Treat them as valid extents by adding a
  // microscopic thickness; otherwise line-heavy drawings collapse back to the
  // database extents and can export as a dot/blank page.
  const hairlinePad = Math.max(span * 1e-6, 1e-6);
  if (width <= 1e-9) { left -= hairlinePad; right += hairlinePad; }
  if (height <= 1e-9) { bottom -= hairlinePad; top += hairlinePad; }

  return makeBox(left, bottom, right, top);
}

function fitBoxFromCadBox(box: any): FitBox | null {
  if (!box) return null;
  try { if (typeof box.isEmpty === "function" && box.isEmpty()) return null; } catch { /* noop */ }
  const min = box.min ?? box.minimum;
  const max = box.max ?? box.maximum;
  if (!min || !max) return null;
  return validFitBox(Number(min.x), Number(min.y), Number(max.x), Number(max.y));
}

function unionFitBoxes(boxes: FitBox[]): FitBox | null {
  if (!boxes.length) return null;
  return makeBox(
    Math.min(...boxes.map((box) => box.min.x)),
    Math.min(...boxes.map((box) => box.min.y)),
    Math.max(...boxes.map((box) => box.max.x)),
    Math.max(...boxes.map((box) => box.max.y)),
  );
}

function fitBoxArea(box: FitBox) {
  return Math.max(box.max.x - box.min.x, 0) * Math.max(box.max.y - box.min.y, 0);
}

function median(values: number[]) {
  const sorted = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  return sorted[Math.floor(sorted.length / 2)];
}

function quantile(values: number[], q: number) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const index = (sorted.length - 1) * q;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function fitBoxFromPoints(min: any, max: any): FitBox | null {
  if (!min || !max) return null;
  return validFitBox(Number(min.x), Number(min.y), Number(max.x), Number(max.y));
}

function databaseExtentsBox(docManager: any): FitBox | null {
  const db = docManager.curDocument?.database;
  return fitBoxFromCadBox(db?.extents) ?? fitBoxFromPoints(db?.extmin, db?.extmax);
}

function renderedExtentsBox(view: any): FitBox | null {
  const scene = view?.cadScene;
  return fitBoxFromCadBox(scene?.activeLayout?.box) ?? fitBoxFromCadBox(scene?.box);
}

function visibleCanvasWorldBox(view: any, container: HTMLElement | null): FitBox | null {
  const canvas = container?.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas || !view?.screenToWorld) return null;

  const cssRect = canvas.getBoundingClientRect();
  const viewWidth = Number(view.width) || cssRect.width;
  const viewHeight = Number(view.height) || cssRect.height;
  if (cssRect.width < 2 || cssRect.height < 2 || viewWidth < 2 || viewHeight < 2) return null;

  const sampleWidth = Math.max(24, Math.min(420, Math.round(cssRect.width)));
  const sampleHeight = Math.max(24, Math.min(420, Math.round(cssRect.height)));
  const sample = document.createElement("canvas");
  sample.width = sampleWidth;
  sample.height = sampleHeight;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    // Keep pixel-based fitting independent of the browser's WebGL buffer timing.
    // The user can see the dot, but copying the canvas later may be blank unless
    // we repaint immediately before sampling.
    try { view.isDirty = true; } catch { /* noop */ }
    try { view?.activeLayoutView?.render?.(view.cadScene); } catch { /* noop */ }
    ctx.drawImage(canvas, 0, 0, sampleWidth, sampleHeight);
    const data = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const histogram = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 24) continue;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      const bucket = histogram.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      histogram.set(key, bucket);
    }

    const background = [...histogram.values()].sort((a, b) => b.count - a.count)[0];
    if (!background) return null;
    const bgR = background.r / background.count;
    const bgG = background.g / background.count;
    const bgB = background.b / background.count;

    let minX = sampleWidth, minY = sampleHeight, maxX = -1, maxY = -1, hits = 0;
    for (let y = 0; y < sampleHeight; y += 1) {
      for (let x = 0; x < sampleWidth; x += 1) {
        // The engine draws a small axes gizmo in the lower-left. It is not CAD
        // geometry and can otherwise be mistaken for the drawing when the model
        // opens as a tiny dot.
        if (x < sampleWidth * 0.18 && y > sampleHeight * 0.78) continue;
        const i = (y * sampleWidth + x) * 4;
        if (data[i + 3] < 24) continue;
        const dr = data[i] - bgR;
        const dg = data[i + 1] - bgG;
        const db = data[i + 2] - bgB;
        if (Math.hypot(dr, dg, db) < 34) continue;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
        hits += 1;
      }
    }

    if (hits < 4 || maxX < minX || maxY < minY) return null;

    const pad = Math.max(8, Math.min(sampleWidth, sampleHeight) * 0.025);
    const left = Math.max(0, minX - pad) / sampleWidth * viewWidth;
    const top = Math.max(0, minY - pad) / sampleHeight * viewHeight;
    const right = Math.min(sampleWidth, maxX + pad) / sampleWidth * viewWidth;
    const bottom = Math.min(sampleHeight, maxY + pad) / sampleHeight * viewHeight;
    const a = view.screenToWorld({ x: left, y: top });
    const b = view.screenToWorld({ x: right, y: bottom });

    return validFitBox(Number(a.x), Number(a.y), Number(b.x), Number(b.y));
  } catch (e) {
    console.warn("[DwgViewer] canvas pixel fit unavailable", e);
    return null;
  }
}

function screenPixelClusterRect(view: any, container: HTMLElement | null, bgStr: string) {
  const canvas = container?.querySelector("canvas") as HTMLCanvasElement | null;
  if (!canvas) return null;

  const cssRect = canvas.getBoundingClientRect();
  const width = Math.max(24, Math.min(520, Math.round(cssRect.width)));
  const height = Math.max(24, Math.min(520, Math.round(cssRect.height)));
  if (width < 24 || height < 24) return null;

  const sample = document.createElement("canvas");
  sample.width = width;
  sample.height = height;
  const ctx = sample.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  try {
    try { view.isDirty = true; } catch { /* noop */ }
    try { view?.activeLayoutView?.render?.(view.cadScene); } catch { /* noop */ }
    ctx.drawImage(canvas, 0, 0, width, height);
    const data = ctx.getImageData(0, 0, width, height).data;
    const histogram = new Map<string, { count: number; r: number; g: number; b: number }>();

    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 24) continue;
      const key = `${data[i] >> 4},${data[i + 1] >> 4},${data[i + 2] >> 4}`;
      const bucket = histogram.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bucket.count += 1;
      bucket.r += data[i];
      bucket.g += data[i + 1];
      bucket.b += data[i + 2];
      histogram.set(key, bucket);
    }

    const background = [...histogram.values()].sort((a, b) => b.count - a.count)[0];
    const bg = background
      ? [background.r / background.count, background.g / background.count, background.b / background.count]
      : parseHexColor(bgStr);
    const pixels: Array<{ x: number; y: number }> = [];

    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        if (x < width * 0.18 && y > height * 0.78) continue;
        const i = (y * width + x) * 4;
        if (data[i + 3] < 24) continue;
        if (Math.hypot(data[i] - bg[0], data[i + 1] - bg[1], data[i + 2] - bg[2]) < 28) continue;
        pixels.push({ x, y });
      }
    }

    if (pixels.length < 3) return null;

    const xs = pixels.map((pixel) => pixel.x);
    const ys = pixels.map((pixel) => pixel.y);
    const x1 = quantile(xs, 0.01);
    const x2 = quantile(xs, 0.99);
    const y1 = quantile(ys, 0.01);
    const y2 = quantile(ys, 0.99);
    const pad = Math.max(10, Math.min(width, height) * 0.035);
    return {
      minX: Math.max(0, x1 - pad),
      minY: Math.max(0, y1 - pad),
      maxX: Math.min(width, x2 + pad),
      maxY: Math.min(height, y2 + pad),
      width,
      height,
      hits: pixels.length,
    };
  } catch (e) {
    console.warn("[DwgViewer] screen pixel cluster unavailable", e);
    return null;
  }
}

function zoomToScreenPixelCluster(view: any, container: HTMLElement | null, bgStr: string) {
  const rect = screenPixelClusterRect(view, container, bgStr);
  if (!rect || !view?.screenToWorld) return false;

  const viewWidth = Number(view.width) || container?.clientWidth || rect.width;
  const viewHeight = Number(view.height) || container?.clientHeight || rect.height;
  const pixelW = rect.maxX - rect.minX;
  const pixelH = rect.maxY - rect.minY;
  const coverage = Math.max(pixelW / rect.width, pixelH / rect.height);
  if (coverage >= 0.32) return false;

  const scaleX = viewWidth / rect.width;
  const scaleY = viewHeight / rect.height;
  const left = rect.minX * scaleX;
  const top = rect.minY * scaleY;
  const right = rect.maxX * scaleX;
  const bottom = rect.maxY * scaleY;
  const a = view.screenToWorld({ x: left, y: top });
  const b = view.screenToWorld({ x: right, y: bottom });
  const box = validFitBox(Number(a.x), Number(a.y), Number(b.x), Number(b.y));
  if (!box) return false;

  refitModelToCenter(view, box, 0.16);
  return true;
}

function spatialIndexBoxes(view: any): FitBox[] {
  const allItems = view?.cadScene?.activeLayout?._spatialIndex?.all?.();
  if (!Array.isArray(allItems)) return [];
  return allItems
    .map((item) => validFitBox(Number(item.minX), Number(item.minY), Number(item.maxX), Number(item.maxY)))
    .filter(Boolean) as FitBox[];
}

function denseClusterFitBox(boxes: FitBox[]): FitBox | null {
  if (boxes.length < 3) return unionFitBoxes(boxes);

  const full = unionFitBoxes(boxes);
  if (!full) return null;

  const centers = boxes.map((box) => ({
    box,
    x: (box.min.x + box.max.x) / 2,
    y: (box.min.y + box.max.y) / 2,
    span: Math.max(box.max.x - box.min.x, box.max.y - box.min.y),
  }));
  const medianX = quantile(centers.map((center) => center.x), 0.5);
  const medianY = quantile(centers.map((center) => center.y), 0.5);
  const distances = centers.map((center) => Math.hypot(center.x - medianX, center.y - medianY));
  const q25 = quantile(distances, 0.25);
  const q50 = quantile(distances, 0.5);
  const q75 = quantile(distances, 0.75);
  const iqr = Math.max(q75 - q25, 0);
  const medianSpan = median(centers.map((center) => center.span));
  const fullSpan = Math.max(full.max.x - full.min.x, full.max.y - full.min.y);
  const distanceCutoff = Math.max(q75 + iqr * 4, q50 * 5, medianSpan * 160, fullSpan * 0.01);

  let clustered = centers.filter((center) => Math.hypot(center.x - medianX, center.y - medianY) <= distanceCutoff);

  const minCluster = Math.max(3, Math.ceil(boxes.length * 0.35));
  if (clustered.length < minCluster) clustered = centers;

  const xs = clustered.map((center) => center.x);
  const ys = clustered.map((center) => center.y);
  const xQ1 = quantile(xs, 0.25);
  const xQ3 = quantile(xs, 0.75);
  const yQ1 = quantile(ys, 0.25);
  const yQ3 = quantile(ys, 0.75);
  const xSlack = Math.max((xQ3 - xQ1) * 5, medianSpan * 160, fullSpan * 0.002);
  const ySlack = Math.max((yQ3 - yQ1) * 5, medianSpan * 160, fullSpan * 0.002);
  const trimmed = clustered.filter((center) => (
    center.x >= xQ1 - xSlack && center.x <= xQ3 + xSlack &&
    center.y >= yQ1 - ySlack && center.y <= yQ3 + ySlack
  ));

  if (trimmed.length >= minCluster) clustered = trimmed;

  const clusterBox = unionFitBoxes(clustered.map((center) => center.box));
  if (!clusterBox) return full;

  const clusterSpan = Math.max(clusterBox.max.x - clusterBox.min.x, clusterBox.max.y - clusterBox.min.y);
  if (clustered.length < boxes.length && clusterSpan < fullSpan * 0.92) return clusterBox;
  return full;
}

function robustRenderedExtentsBox(view: any): FitBox | null {
  const boxes = spatialIndexBoxes(view);
  if (boxes.length < 3) return renderedExtentsBox(view);

  const full = unionFitBoxes(boxes);
  if (!full) return renderedExtentsBox(view);

  const denseCluster = denseClusterFitBox(boxes);
  if (denseCluster && denseCluster !== full) return denseCluster;

  const medianWidth = median(boxes.map((box) => box.max.x - box.min.x));
  const medianHeight = median(boxes.map((box) => box.max.y - box.min.y));
  const medianArea = median(boxes.map(fitBoxArea));
  if (!medianWidth || !medianHeight || !medianArea) return full;

  // Some DWGs contain bad proxy/image/view entities with enormous coordinates.
  // Fitting those makes the real drawing collapse into a dot, so use the dense
  // entity cluster unless nearly everything is legitimately that large.
  const normalBoxes = boxes.filter((box) => {
    const width = box.max.x - box.min.x;
    const height = box.max.y - box.min.y;
    const area = fitBoxArea(box);
    return width <= medianWidth * 250 && height <= medianHeight * 250 && area <= medianArea * 2500;
  });

  if (normalBoxes.length >= Math.max(3, boxes.length * 0.45)) {
    const robust = unionFitBoxes(normalBoxes);
    if (robust && fitBoxArea(robust) < fitBoxArea(full) * 0.65) return robust;
  }

  return full;
}

function projectedBoxRect(view: any, box: FitBox) {
  const corners = [
    box.min,
    { x: box.min.x, y: box.max.y },
    box.max,
    { x: box.max.x, y: box.min.y },
  ];
  const points = corners.map((point) => view.worldToScreen(point));
  const xs = points.map((point) => Number(point.x)).filter(Number.isFinite);
  const ys = points.map((point) => Number(point.y)).filter(Number.isFinite);
  if (xs.length !== 4 || ys.length !== 4) return null;
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

function modelNeedsRefit(view: any, box: FitBox, container: HTMLElement | null): boolean {
  const rect = projectedBoxRect(view, box);
  const width = Number(view?.width) || container?.clientWidth || 1;
  const height = Number(view?.height) || container?.clientHeight || 1;
  if (!rect || width <= 1 || height <= 1) return true;

  const coverage = Math.max(rect.width / width, rect.height / height);
  const centerX = (rect.minX + rect.maxX) / 2;
  const centerY = (rect.minY + rect.maxY) / 2;
  const centerDrift = Math.hypot(centerX - width / 2, centerY - height / 2) / Math.min(width, height);
  const completelyOffscreen = rect.maxX < 0 || rect.minX > width || rect.maxY < 0 || rect.minY > height;

  return completelyOffscreen || coverage < 0.35 || coverage > 1.08 || centerDrift > 0.22;
}

function refitModelToCenter(view: any, box: FitBox, paddingRatio = 0.08) {
  const spanX = box.max.x - box.min.x;
  const spanY = box.max.y - box.min.y;
  const base = Math.max(spanX, spanY);
  const padX = Math.max(spanX * paddingRatio, base * 0.01);
  const padY = Math.max(spanY * paddingRatio, base * 0.01);
  view.zoomTo(makeBox(box.min.x - padX, box.min.y - padY, box.max.x + padX, box.max.y + padY), 1);
}

function paddedFitBox(box: FitBox, ratio = 0.08): FitBox {
  const spanX = box.max.x - box.min.x;
  const spanY = box.max.y - box.min.y;
  const padX = Math.max(spanX * ratio, Math.max(spanX, spanY) * 0.002);
  const padY = Math.max(spanY * ratio, Math.max(spanX, spanY) * 0.002);
  return makeBox(box.min.x - padX, box.min.y - padY, box.max.x + padX, box.max.y + padY);
}

function parseHexColor(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function countVisibleDrawingPixels(data: Uint8ClampedArray | Uint8Array, bg: [number, number, number]) {
  let pixels = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 24) continue;
    const dr = data[i] - bg[0];
    const dg = data[i + 1] - bg[1];
    const db = data[i + 2] - bg[2];
    if (Math.hypot(dr, dg, db) > 28) {
      pixels += 1;
    }
  }
  return pixels;
}

function assertExportHasDrawingPixels(
  data: Uint8ClampedArray | Uint8Array,
  bg: [number, number, number],
  source: string,
) {
  const pixels = countVisibleDrawingPixels(data, bg);
  if (pixels < MIN_EXPORT_DRAWING_PIXELS) {
    throw new Error(
      `PDF export captured too few drawing pixels (${pixels}/${MIN_EXPORT_DRAWING_PIXELS}). ` +
      "The drawing may still be loading, blank, or outside the fitted extents. Try Zoom Extents, wait a moment, then export again."
    );
  }
  console.info(`[DwgViewer] PDF snapshot pixel check passed from ${source}: ${pixels} drawing pixels`);
}

function isExportPixelError(error: unknown) {
  return error instanceof Error && error.message.startsWith("PDF export captured too few drawing pixels");
}

function currentCanvasSnapshot(canvas: HTMLCanvasElement, bgStr: string): string | null {
  const bg = parseHexColor(bgStr);
  try {
    const off = document.createElement("canvas");
    off.width = canvas.width || Math.max(1, Math.round(canvas.getBoundingClientRect().width));
    off.height = canvas.height || Math.max(1, Math.round(canvas.getBoundingClientRect().height));
    const ctx = off.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.fillStyle = bgStr;
    ctx.fillRect(0, 0, off.width, off.height);
    ctx.drawImage(canvas, 0, 0, off.width, off.height);
    const image = ctx.getImageData(0, 0, off.width, off.height);
    assertExportHasDrawingPixels(image.data, bg, "visible-canvas");
    return off.toDataURL("image/png");
  } catch (error) {
    if (isExportPixelError(error)) throw error;
    return null;
  }
}

function rgbaPixelsToPngDataUrl(pixels: Uint8Array, width: number, height: number, flipY: boolean, bgStr: string): string | null {
  const bg = [255, 255, 255]; // Use white reference for pixel validation since offscreen clear is transparent white
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y += 1) {
    const srcY = flipY ? height - 1 - y : y;
    for (let x = 0; x < width; x += 1) {
      const src = (srcY * width + x) * 4;
      const dst = (y * width + x) * 4;
      // Copy colors and alpha directly to preserve transparency in PDF export
      image.data[dst] = pixels[src];
      image.data[dst + 1] = pixels[src + 1];
      image.data[dst + 2] = pixels[src + 2];
      image.data[dst + 3] = pixels[src + 3];
    }
  }

  ctx.putImageData(image, 0, 0);
  assertExportHasDrawingPixels(image.data, bg, "offscreen-render-target");
  return canvas.toDataURL("image/png");
}

async function offscreenCadSnapshot(view: any, box: FitBox, bgStr: string): Promise<string | null> {
  const layoutView = view?.activeLayoutView;
  const rendererWrapper = view?.renderer;
  const renderer = rendererWrapper?.internalRenderer;
  const scene = view?.internalScene;
  const camera = view?.internalCamera;
  if (!layoutView || !renderer || !scene || !camera) return null;
  if (typeof layoutView.applyExportCamera !== "function" || typeof layoutView.renderObject !== "function") return null;

  const viewWidth = Math.max(1, Math.round(Number(view.width) || 1200));
  const viewHeight = Math.max(1, Math.round(Number(view.height) || 800));
  const aspect = viewWidth / viewHeight;
  const outputWidth = aspect >= 1 ? PDF_EXPORT_LONG_SIDE : Math.max(1, Math.round(PDF_EXPORT_LONG_SIDE * aspect));
  const outputHeight = aspect >= 1 ? Math.max(1, Math.round(PDF_EXPORT_LONG_SIDE / aspect)) : PDF_EXPORT_LONG_SIDE;

  const originalZoom = camera.zoom;
  const originalPosition = camera.position?.clone?.();
  const originalLeft = camera.left;
  const originalRight = camera.right;
  const originalTop = camera.top;
  const originalBottom = camera.bottom;
  const savedScissorTest = renderer.getScissorTest?.();
  const savedPixelRatio = renderer.getPixelRatio?.();
  const originalRenderTarget = renderer.getRenderTarget?.();
  let renderTarget: any;

  // Variables for restoring clear color & background
  let savedClearColor: any = null;
  let savedClearAlpha = 1;
  const savedBg = view.backgroundColor;

  try {
    const THREE = await import("three");

    // Save clear settings
    savedClearColor = new THREE.Color();
    renderer.getClearColor(savedClearColor);
    savedClearAlpha = renderer.getClearAlpha();

    // Temporarily switch CAD canvas background to white (0xffffff)
    // This forces ACI-7 (white on black screen) lines to render as black.
    view.backgroundColor = 0xffffff;
    view.applyCanvasBackground?.(0xffffff);

    // Set WebGL clear color to white with 0 alpha (fully transparent)
    renderer.setClearColor(0xffffff, 0);

    layoutView.applyExportCamera(paddedFitBox(box, 0.08), outputWidth, outputHeight);
    renderer.setPixelRatio?.(1);
    rendererWrapper.updateLineResolution?.(outputWidth, outputHeight);
    renderTarget = new THREE.WebGLRenderTarget(outputWidth, outputHeight, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.UnsignedByteType,
    });
    renderer.setRenderTarget(renderTarget);
    renderer.setViewport(0, 0, outputWidth, outputHeight);
    renderer.setScissorTest?.(false);
    layoutView.renderObject(scene);

    const pixels = new Uint8Array(outputWidth * outputHeight * 4);
    renderer.readRenderTargetPixels(renderTarget, 0, 0, outputWidth, outputHeight, pixels);
    return rgbaPixelsToPngDataUrl(pixels, outputWidth, outputHeight, true, bgStr);
  } catch (e) {
    if (isExportPixelError(e)) throw e;
    console.warn("[DwgViewer] offscreen PDF snapshot failed", e);
    return null;
  } finally {
    if (renderer) {
      try { renderer.setRenderTarget?.(originalRenderTarget ?? null); } catch { /* noop */ }
      if (savedClearColor) {
        try { renderer.setClearColor(savedClearColor, savedClearAlpha); } catch { /* noop */ }
      }
    }
    if (view) {
      try {
        view.backgroundColor = savedBg;
        view.applyCanvasBackground?.(savedBg);
      } catch { /* noop */ }
    }
    try { renderTarget?.dispose?.(); } catch { /* noop */ }
    if (Number.isFinite(originalZoom)) camera.zoom = originalZoom;
    if (originalPosition && camera.position?.copy) camera.position.copy(originalPosition);
    if (Number.isFinite(originalLeft)) camera.left = originalLeft;
    if (Number.isFinite(originalRight)) camera.right = originalRight;
    if (Number.isFinite(originalTop)) camera.top = originalTop;
    if (Number.isFinite(originalBottom)) camera.bottom = originalBottom;
    try { camera.updateProjectionMatrix?.(); } catch { /* noop */ }
    if (Number.isFinite(savedPixelRatio)) renderer.setPixelRatio?.(savedPixelRatio);
    try { rendererWrapper.setSize?.(viewWidth, viewHeight); } catch { /* noop */ }
    if (typeof savedScissorTest === "boolean") renderer.setScissorTest?.(savedScissorTest);
    try { rendererWrapper.syncCameraZoom?.(originalZoom); } catch { /* noop */ }
    try { layoutView.render?.(view.cadScene); } catch { /* noop */ }
    try { view.isDirty = true; } catch { /* noop */ }
  }
}

export default function DwgViewer({
  revision,
  blob,
  editable,
  bgTheme,
  onDirtyChange,
  registerExportHandler,
  registerSaveHandler,
  registerCommandRunner,
  registerCanvasSnapshot,
}: ViewerProps) {
  const getThemeColors = (theme?: string) => {
    switch (theme) {
      case "charcoal":
        return { bg: "#1e1e1e", hex: 0x1e1e1e };
      case "light-slate":
        return { bg: "#f8fafc", hex: 0xf8fafc };
      case "warm-white":
        return { bg: "#fafaf9", hex: 0xfafaf9 };
      case "dark-slate":
        return { bg: "#0f172a", hex: 0x0f172a };
      default:
        return { bg: editable ? EDIT_BACKGROUND : VIEW_BACKGROUND, hex: editable ? EDIT_BACKGROUND_HEX : VIEW_BACKGROUND_HEX };
    }
  };

  const { bg: viewerBg, hex: viewerBgHex } = getThemeColors(bgTheme);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const docManagerRef = useRef<any>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [message, setMessage] = useState<string>("Initializing CAD engine…");

  useEffect(() => {
    let cancelled = false;
    let docManager: any = null;
    const prevStack: ReturnType<typeof makeBox>[] = [];
    const nextStack: ReturnType<typeof makeBox>[] = [];

    (async () => {
      try {
        if (!containerRef.current) return;
        patchCadDataFontsFetch();
        setMessage("Loading CAD engine…");
        const [mod, dataModel, dxfWorkerUrl, dwgWorkerUrl, mtextWorkerUrl] = await Promise.all([
          import("@mlightcad/cad-simple-viewer"),
          import("@mlightcad/data-model"),
          workerBlobUrl("dxf-parser-worker.js"),
          workerBlobUrl("libredwg-parser-worker.js"),
          workerBlobUrl("mtext-renderer-worker.js"),
        ]);
        if (cancelled) return;
        const { AcApDocManager } = mod as any;

        docManager =
          AcApDocManager.createInstance({
            container: containerRef.current,
            autoResize: true,
            baseUrl: CAD_DATA_BASE,
            notLoadDefaultFonts: false,
            webworkerFileUrls: {
              dxfParser: dxfWorkerUrl,
              dwgParser: dwgWorkerUrl,
              mtextRender: mtextWorkerUrl,
            },
          }) ?? AcApDocManager.instance;
        docManagerRef.current = docManager; // Store in ref for dynamic background theme changes
        patchRegisteredCadConverters(dataModel);

        // Patch AcDbBlockTableRecord layoutId getter to prevent save-crash from missing attributes
        if (dataModel?.AcDbBlockTableRecord) {
          const proto = dataModel.AcDbBlockTableRecord.prototype;
          const descriptor = Object.getOwnPropertyDescriptor(proto, "layoutId");
          if (descriptor) {
            const originalGet = descriptor.get;
            Object.defineProperty(proto, "layoutId", {
              ...descriptor,
              get: function () {
                try {
                  return originalGet ? originalGet.call(this) : this.getAttrWithoutException?.("layoutId") ?? "";
                } catch {
                  return this.getAttrWithoutException?.("layoutId") ?? "";
                }
              }
            });
            console.info("[DwgViewer] Patched AcDbBlockTableRecord.prototype.layoutId getter successfully.");
          }
        }

        await docManager.loadDefaultFonts?.(["txt", "simplex", "romans", "amgdt"]);

        setMessage(`Parsing ${revision.fileName}…`);
        const buf = await blob.arrayBuffer();
        const openMode = (mod as any).AcEdOpenMode?.Write ?? 8;
        const openOpts = {
          mode: editable ? openMode : (mod as any).AcEdOpenMode?.Read ?? 0,
          progressiveRendering: true,
          openViewMode: (mod as any).AcApOpenViewMode?.Extents ?? "extents",
          sysVars: greyCanvasSysVars(dataModel, viewerBgHex),
          timeout: 180000, // Increase worker parser timeout to 3 minutes (180,000ms) for large or complex drawings
        };

        const tryOpen = async () =>
          docManager.openDocument(revision.fileName, buf.slice(0), openOpts);

        let ok = false;
        let lastErr: unknown = null;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            ok = await tryOpen();
            lastErr = null;
            break;
          } catch (e) {
            lastErr = e;
            const msg = e instanceof Error ? e.message : String(e);
            console.warn(`[DwgViewer] parse attempt ${attempt} failed:`, msg);
            if (!/timed out/i.test(msg) || attempt === 2) break;
            setMessage(`Parsing is taking longer than usual — retrying ${revision.fileName}…`);
          }
        }
        if (cancelled) return;
        if (lastErr) {
          const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
          setStatus("error");
          if (/timed out/i.test(msg)) {
            setMessage(
              "This drawing is too large or complex for the in-browser parser (worker timed out). " +
              "Try uploading a DXF version, or simplify/purge the DWG and re-upload."
            );
          } else {
            setMessage(`Could not parse this drawing: ${msg}`);
          }
          return;
        }
        if (!ok) {
          setStatus("error");
          setMessage("Could not parse this drawing file.");
          return;
        }

        setStatus("ready");

        // Force the engine's WebGL clear color to match the paper background so
        // the drawing renders as dark strokes on light paper (ACI-7 auto-inverts).
        try {
          const v = docManager.curView;
          if (v) {
            v.applyCanvasBackground?.(viewerBgHex);
            v.backgroundColor = viewerBgHex;
            try { v.activeLayoutView?.render?.(v.cadScene); } catch { /* noop */ }
          }
        } catch (e) {
          console.warn("[DwgViewer] could not set background color", e);
        }


        let pixelFitZooms = 0;

        const frameDrawing = (reason: string) => {
          const view = docManager.curView;
          if (!view) return;

          try {
            const isProgressive = reason.startsWith("progressive-") || reason === "initial-open";

            const runPixelFit = (label: string) => {
              if (isProgressive) return; // Skip screen pixel fits during progressive loads to avoid synchronous render crashes
              if (zoomToScreenPixelCluster(view, containerRef.current, viewerBg)) {
                if (pixelFitZooms >= 6) return;
                pixelFitZooms += 1;
                console.info("[DwgViewer] Zoomed into visible pixel cluster", label);
                window.setTimeout(() => runPixelFit(`${label}-again`), 90);
              }
            };

            // Prefer actual pixels already visible on the canvas. If the drawing
            // has collapsed into a dot because model extents include bad outliers,
            // this screen-space detection finds the real rendered cluster and
            // converts it back to world coordinates before zooming.
            const box = isProgressive
              ? (robustRenderedExtentsBox(view) ?? databaseExtentsBox(docManager))
              : (visibleCanvasWorldBox(view, containerRef.current) ??
                 robustRenderedExtentsBox(view) ??
                 databaseExtentsBox(docManager));
            if (!box) return;

            if (modelNeedsRefit(view, box, containerRef.current)) {
              refitModelToCenter(view, box);
              console.info("[DwgViewer] Recentered drawing after extent sanity check", reason);
              if (!isProgressive) {
                window.setTimeout(() => runPixelFit(`${reason}-post-extents`), 80);
              }
            } else {
              runPixelFit(`${reason}-pixels`);
            }
          } catch (e) {
            console.warn("[DwgViewer] extent sanity check failed", e);
          }
        };

        // Prevent the “tiny dot” issue by checking extents immediately, during
        // progressive entity conversion, and after the final batches have landed.
        frameDrawing("initial-open");
        const timers = [120, 400, 900, 1600, 3000, 5200, 8000].map((d) =>
          window.setTimeout(() => frameDrawing(`progressive-${d}`), d),
        );

        // Zoom helpers — bypass the interactive `zoom` command since its
        // sub-keywords aren't valid standalone command strings.
        const pushPrev = () => {
          const v = docManager.curView; if (!v) return;
          try { prevStack.push(currentViewBox(v)); nextStack.length = 0; } catch { /* noop */ }
        };
        const zoomBy = (factor: number) => {
          const v = docManager.curView; if (!v) return;
          try {
            const a = v.screenToWorld({ x: 0, y: 0 });
            const b = v.screenToWorld({ x: v.width, y: v.height });
            const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
            const halfW = Math.abs(b.x - a.x) / 2 / factor;
            const halfH = Math.abs(b.y - a.y) / 2 / factor;
            pushPrev();
            v.zoomTo(makeBox(cx - halfW, cy - halfH, cx + halfW, cy + halfH), 1);
          } catch (e) { console.warn("[DwgViewer] zoomBy failed", e); }
        };
        const zoomExtents = () => {
          const v = docManager.curView; if (!v) return;
          pushPrev();
          pixelFitZooms = 0;
          frameDrawing("toolbar-zoom-extents");
        };
        const zoomPrev = () => {
          const v = docManager.curView; if (!v || !prevStack.length) return;
          try { nextStack.push(currentViewBox(v)); v.zoomTo(prevStack.pop()!, 1); } catch (e) { console.warn(e); }
        };
        const zoomNext = () => {
          const v = docManager.curView; if (!v || !nextStack.length) return;
          try { prevStack.push(currentViewBox(v)); v.zoomTo(nextStack.pop()!, 1); } catch (e) { console.warn(e); }
        };

        registerCommandRunner?.((cmd) => {
          // Direct view-API zoom commands first.
          if (cmd === "ZOOM_IN") return zoomBy(2);
          if (cmd === "ZOOM_OUT") return zoomBy(0.5);
          if (cmd === "ZOOM_EXTENTS") return zoomExtents();
          if (cmd === "ZOOM_PREV") return zoomPrev();
          if (cmd === "ZOOM_NEXT") return zoomNext();

          const m = COMMAND_MAP[cmd];
          if (!m) return;
          try {
            docManager.sendStringToExecute(m);
            if (editable && MUTATING.has(cmd)) onDirtyChange?.(true);
          } catch (e) {
            console.warn("[DwgViewer] command failed", cmd, e);
          }
        });

        const exportDxf = () => {
          const fileName = revision.fileName.replace(/\.[^.]+$/, "") + ".dxf";
          const dxf = docManager.curDocument?.database?.dxfOut?.(undefined, 6);
          if (!dxf) return { blob, fileName: revision.fileName };
          return { blob: new Blob([dxf], { type: "application/dxf;charset=utf-8" }), fileName };
        };

        registerExportHandler?.(async () => {
          try { return exportDxf(); } catch { return null; }
        });
        registerSaveHandler?.(async () => exportDxf());

        registerCanvasSnapshot?.(async () => {
          const canvas = containerRef.current?.querySelector("canvas") as HTMLCanvasElement | null;
          if (!canvas) throw new Error("PDF export failed because the CAD canvas is not ready yet.");
          const view = docManager.curView as any;

          const modelBox = robustRenderedExtentsBox(view) ?? databaseExtentsBox(docManager);
          if (!modelBox) {
            throw new Error("PDF export failed because drawing extents could not be detected.");
          }

          // Always fit to real extents before PDF export so the captured image is
          // centred and contains the visible CAD geometry, not the user's current
          // zoomed-out/tiny-dot view.
          try {
            refitModelToCenter(view, modelBox);
            view.isDirty = true;
          } catch { /* noop */ }

          if (modelBox) {
            // Render the fitted extents directly to an offscreen WebGL target so
            // PDF export does not depend on the visible WebGL drawing buffer.
            const offscreenSnap = await offscreenCadSnapshot(view, modelBox, viewerBg);
            if (offscreenSnap) return offscreenSnap;
          }

          // WebGL canvases clear their drawing buffer after presenting, so a
          // direct toDataURL() yields a blank PNG. Force a render and capture
          // the pixels inside the same frame by copying into a 2D canvas.
          const capture = () => currentCanvasSnapshot(canvas, viewerBg);

          const renderOnce = () => {
            try { view.isDirty = true; } catch { /* noop */ }
            try { view?.activeLayoutView?.render?.(view.cadScene); } catch { /* noop */ }
            try { docManager?.curDocument?.editor?.regen?.(); } catch { /* noop */ }
          };

          // Try a few frames in case the first render hasn't flushed yet.
          for (let i = 0; i < 4; i++) {
            renderOnce();
            const snap = await new Promise<string | null>((resolve) => {
              requestAnimationFrame(() => {
                renderOnce();
                requestAnimationFrame(() => resolve(capture()));
              });
            });
            if (snap) return snap;
          }
          throw new Error(
            "PDF export could not capture enough visible drawing pixels. " +
            "The drawing may still be loading or the CAD engine may have skipped unsupported image entities."
          );
        });


        if (editable) {
          try { docManager.sendStringToExecute("select"); } catch { /* noop */ }
        }

        onDirtyChange?.(false);
        // Stash cleanup
        (docManager as any).__lovableTimers = timers;
      } catch (err) {
        console.error("[DwgViewer] init failed", err);
        if (!cancelled) {
          setStatus("error");
          setMessage(err instanceof Error ? err.message : "Failed to initialize CAD viewer.");
        }
      }
    })();

    return () => {
      cancelled = true;
      const timers: number[] | undefined = (docManager as any)?.__lovableTimers;
      timers?.forEach((t) => clearTimeout(t));
      if (docManager) {
        console.info("[DwgViewer] Cleaning up and destroying AcApDocManager instance...");
        docManager.destroy().catch((e: any) => {
          console.warn("[DwgViewer] Failed to destroy docManager during cleanup:", e);
        });
        docManagerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revision.id, editable]);

  // Dynamically update canvas background color when theme changes without re-initializing the whole engine
  useEffect(() => {
    const docManager = docManagerRef.current;
    if (!docManager) return;
    try {
      const v = docManager.curView;
      if (v) {
        console.info(`[DwgViewer] Dynamically updating canvas background to ${bgTheme} (${viewerBg})`);
        v.applyCanvasBackground?.(viewerBgHex);
        v.backgroundColor = viewerBgHex;
        try { v.activeLayoutView?.render?.(v.cadScene); } catch { /* noop */ }
      }
    } catch (e) {
      console.warn("[DwgViewer] Could not dynamically update background color", e);
    }
  }, [bgTheme, viewerBgHex, viewerBg]);

  // Double-click on Text or MText entity to edit its contents
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !editable) return;

    const handleDblClick = (e: MouseEvent) => {
      const docManager = docManagerRef.current;
      if (!docManager) return;
      const v = docManager.curView;
      if (!v) return;

      try {
        const rect = el.getBoundingClientRect();
        // viewportToCanvas converts from Client/Viewport coords to Canvas local coords
        const canvasCoords = v.viewportToCanvas({
          x: e.clientX,
          y: e.clientY,
        });
        const worldCoords = v.screenToWorld(canvasCoords);
        
        // Pick the entity under the mouse pointer
        const picked = v.pick(worldCoords, void 0, !0);
        if (!picked || picked.length === 0) return;

        const db = docManager.curDocument?.database;
        if (!db) return;

        const entityId = picked[0].id;
        const entity = db.tables.blockTable.getEntityById(entityId);
        if (!entity) return;

        // Check if it's Text or MText
        const isMText = typeof entity.contents === "string" || entity.constructor.name === "AcDbMText";
        const isText = typeof entity.textString === "string" || entity.constructor.name === "AcDbText";

        if (isMText || isText) {
          e.preventDefault();
          e.stopPropagation();

          // Retrieve current text value
          const currentText = isMText ? entity.contents : entity.textString;

          // Prompt the user for new text content
          const newText = window.prompt("Edit Text Content:", currentText);
          if (newText !== null && newText !== currentText) {
            // Edit the entity inside a transaction
            db.runDatabaseEdit("Edit Text", () => {
              const writeEntity = db.openEntityForWrite(entity);
              if (writeEntity) {
                if (isMText) {
                  writeEntity.contents = newText;
                } else {
                  writeEntity.textString = newText;
                }
              }
            });

            // Mark document as modified
            docManager.curDocument.isDirty = true;
            onDirtyChange?.(true);

            // Update the graphical representation in the active view
            try {
              v.updateEntity?.(entity);
              v.isDirty = true;
              v._isDirty = true;
              v.activeLayoutView?.render?.(v.cadScene);
            } catch (err) {
              console.warn("[DwgViewer] Failed to update visual representation, trying full render:", err);
              try { v.activeLayoutView?.render?.(v.cadScene); } catch { /* noop */ }
            }
          }
        }
      } catch (err) {
        console.error("[DwgViewer] Double-click text edit failed:", err);
      }
    };

    el.addEventListener("dblclick", handleDblClick, true);
    return () => {
      el.removeEventListener("dblclick", handleDblClick, true);
    };
  }, [editable, onDirtyChange]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" style={{ background: viewerBg }} />
      {status !== "ready" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground shadow">
            {status === "error" ? <span className="text-destructive">{message}</span> : message}
          </div>
        </div>
      )}
    </div>
  );
}
