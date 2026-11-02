"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { documentViewUrl, isSpreadsheet } from "@/lib/spreadsheet-preview";

const ZOOM_STEPS = [1, 1.5, 2, 3];
const SUPPORTED_IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif"]);

interface PhoneDocument {
  id: string;
  fileName: string;
  mimeType: string;
}

const isPdf = (d: PhoneDocument) => d.mimeType.toLowerCase() === "application/pdf" || /\.pdf$/i.test(d.fileName);

/**
 * The document viewer for a phone. An iPhone's built-in PDF frame shows only the first page and can't be scrolled
 * properly, so PDFs are shown as a stack of page pictures you scroll down, with zoom buttons (pinching works too).
 * Photos get the same zoom. Spreadsheets use their table view; anything else can only be opened as a file.
 * Give it key={document.id} so switching documents starts fresh.
 */
export function PhoneDocumentViewer({ doc, jumpPage }: { doc: PhoneDocument; jumpPage: number | null }) {
  const [zoomIndex, setZoomIndex] = useState(0);
  const [pages, setPages] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pdf = isPdf(doc);

  useEffect(() => {
    if (!pdf) return;
    const controller = new AbortController();
    fetch(`/api/client-need-documents/${doc.id}/pages`, { signal: controller.signal })
      .then((res) => res.json() as Promise<{ pages: number }>)
      .then((data) => setPages(data.pages))
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === "AbortError")) setPages(0);
      });
    return () => controller.abort();
  }, [doc.id, pdf]);

  // Jump to a page the AI review pointed at.
  useEffect(() => {
    if (jumpPage && pages) scroller.current?.querySelector(`[data-page="${jumpPage}"]`)?.scrollIntoView({ block: "start" });
  }, [jumpPage, pages]);

  const zoom = ZOOM_STEPS[zoomIndex];
  const zoomBar = (label: string) => (
    <div className="flex shrink-0 items-center justify-between border-b bg-background px-2 py-1">
      <span className="truncate text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1">
        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom out" disabled={zoomIndex === 0} onClick={() => setZoomIndex((i) => Math.max(0, i - 1))}>
          <Minus className="size-4" />
        </Button>
        <span className="w-10 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
        <Button type="button" size="icon-sm" variant="outline" aria-label="Zoom in" disabled={zoomIndex === ZOOM_STEPS.length - 1} onClick={() => setZoomIndex((i) => Math.min(ZOOM_STEPS.length - 1, i + 1))}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );

  if (isSpreadsheet(doc.mimeType, doc.fileName)) {
    return <iframe src={documentViewUrl(doc)} title={doc.fileName} className="h-full w-full" />;
  }

  const fileLink = (
    <a href={`/api/client-need-documents/${doc.id}`} target="_blank" rel="noreferrer" className="text-primary underline">
      Open the file
    </a>
  );

  if (SUPPORTED_IMAGE_TYPES.has(doc.mimeType.toLowerCase())) {
    return (
      <div className="flex h-full flex-col">
        {zoomBar(doc.fileName)}
        <div className="min-h-0 flex-1 overflow-auto [touch-action:pan-x_pan-y_pinch-zoom]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/client-need-documents/${doc.id}`} alt={doc.fileName} style={{ width: `${zoom * 100}%`, maxWidth: "none" }} />
        </div>
      </div>
    );
  }

  if (pdf) {
    return (
      <div className="flex h-full flex-col">
        {zoomBar(pages ? `${pages} page${pages === 1 ? "" : "s"}` : doc.fileName)}
        <div ref={scroller} className="min-h-0 flex-1 space-y-2 overflow-auto bg-muted p-1 [touch-action:pan-x_pan-y_pinch-zoom]">
          {pages === null && <p className="p-4 text-sm text-muted-foreground">Loading…</p>}
          {pages === 0 && <p className="p-4 text-sm text-muted-foreground">This PDF couldn&apos;t be shown here. {fileLink}.</p>}
          {Array.from({ length: pages ?? 0 }, (_, i) => (
            <div key={i} data-page={i + 1} style={{ width: `${zoom * 100}%` }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`/api/client-need-documents/${doc.id}/pages/${i + 1}`} alt={`Page ${i + 1} of ${doc.fileName}`} loading="lazy" className="block w-full bg-white" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <p className="p-4 text-sm text-muted-foreground">
      This kind of file can&apos;t be previewed on a phone. {fileLink} to view it.
    </p>
  );
}
