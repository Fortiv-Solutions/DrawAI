// Pluggable viewer registry. Future IFC/Forge viewers just register here.

import type { ComponentType } from "react";
import type { DrawingFormat, Revision } from "@/domain";

export interface ViewerProps {
  revision: Revision;
  blob: Blob;
  /** Called by viewers when their internal dirty state changes. */
  onDirtyChange?: (dirty: boolean) => void;
  /** Provided to viewers as a save handle. */
  registerSaveHandler?: (handler: () => Promise<ViewerFileResult | null>) => void;
  /** Provided to viewers as an export handle (returns blob to download). */
  registerExportHandler?: (handler: () => Promise<ViewerFileResult | null>) => void;
  /** Ribbon command dispatch — viewers may ignore commands they don't support. */
  registerCommandRunner?: (run: (cmd: string) => void) => void;
  /** Lets the host snapshot the current canvas as a PNG data URL (for PDF export). */
  registerCanvasSnapshot?: (snap: () => string | null | Promise<string | null>) => void;
  editable: boolean;
  bgTheme?: string;
}

export interface ViewerFileResult {
  blob: Blob;
  fileName?: string;
}

export interface ViewerPlugin {
  formats: DrawingFormat[];
  component: ComponentType<ViewerProps>;
  /** Display name for the placeholder while loading. */
  label: string;
  /** Commands the viewer can execute. */
  supportedCommands?: string[];
}
