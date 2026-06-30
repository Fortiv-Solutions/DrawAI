// Routes a revision to the correct viewer plugin. UI never imports viewers directly.

import { Suspense, useEffect, useState } from "react";
import { getRevisionBlob } from "@/repositories";
import type { Revision } from "@/domain";
import { viewerFor } from "./registry";
import type { ViewerFileResult } from "./types";

interface Props {
  revision: Revision;
  editable: boolean;
  registerExportHandler?: (h: () => Promise<ViewerFileResult | null>) => void;
  registerSaveHandler?: (h: () => Promise<ViewerFileResult | null>) => void;
  registerCommandRunner?: (run: (cmd: string) => void) => void;
  registerCanvasSnapshot?: (snap: () => string | null | Promise<string | null>) => void;
  onDirtyChange?: (dirty: boolean) => void;
  bgTheme?: string;
}

export function ViewerHost(props: Props) {
  const [blob, setBlob] = useState<Blob | null | "missing">(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const b = await getRevisionBlob(props.revision.id);
      if (cancelled) return;
      setBlob(b ?? "missing");
    })();
    return () => {
      cancelled = true;
    };
  }, [props.revision.id]);

  const plugin = viewerFor(props.revision.format);

  if (!plugin) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground">
        No viewer registered for <code className="mx-1 font-mono">{props.revision.format}</code> files yet.
      </div>
    );
  }

  if (blob === null) {
    return <ViewerPlaceholder label={`Loading ${plugin.label}…`} />;
  }

  if (blob === "missing") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted p-8 text-center text-sm text-muted-foreground">
        <div>
          <p className="font-medium text-foreground">No file blob stored locally.</p>
          <p className="mt-1 text-xs">
            This revision was created from seed data with no binary attached. Upload a new file to view it.
          </p>
        </div>
      </div>
    );
  }

  const Plugin = plugin.component;
  return (
    <Suspense fallback={<ViewerPlaceholder label={`Loading ${plugin.label}…`} />}>
      <Plugin
        revision={props.revision}
        blob={blob}
        editable={props.editable}
        onDirtyChange={props.onDirtyChange}
        bgTheme={props.bgTheme}
        registerExportHandler={props.registerExportHandler}
        registerSaveHandler={props.registerSaveHandler}
        registerCommandRunner={props.registerCommandRunner}
        registerCanvasSnapshot={props.registerCanvasSnapshot}
      />
    </Suspense>
  );
}

function ViewerPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <div className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
        {label}
      </div>
    </div>
  );
}
