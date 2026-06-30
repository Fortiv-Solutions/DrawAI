import { lazy } from "react";
import type { DrawingFormat } from "@/domain";
import type { ViewerPlugin } from "./types";

const DwgViewer = lazy(() => import("./DwgViewer"));
const PdfViewer = lazy(() => import("./PdfViewer"));
const ImageViewer = lazy(() => import("./ImageViewer"));

export const VIEWER_REGISTRY: ViewerPlugin[] = [
  {
    formats: ["DWG", "DXF"],
    component: DwgViewer,
    label: "CAD viewer (mlightcad)",
    supportedCommands: [
      "SELECT", "MOVE", "COPY", "ROTATE", "ERASE", "ZOOM", "PAN",
      "ZOOM_EXTENTS", "UNDO", "REDO", "MEASURE_DIST", "MEASURE_ANGLE",
      "MEASURE_AREA", "CLEAR_MEASUREMENTS",
    ],
  },
  { formats: ["PDF"], component: PdfViewer, label: "PDF viewer", supportedCommands: ["ZOOM", "PAN"] },
  { formats: ["PNG", "JPG"], component: ImageViewer, label: "Image viewer", supportedCommands: ["ZOOM", "PAN"] },
];

export function viewerFor(format: DrawingFormat): ViewerPlugin | undefined {
  return VIEWER_REGISTRY.find((v) => v.formats.includes(format));
}
