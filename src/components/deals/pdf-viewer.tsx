"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// pdfjs-dist's own worker, copied into public/ (see package.json's pinned
// version — the two must match, since the worker and main bundle are one
// protocol) rather than resolved through the bundler, which sidesteps
// Turbopack/webpack asset-URL quirks entirely.
const WORKER_SRC = "/pdf.worker.min.mjs";

type PdfjsModule = typeof import("pdfjs-dist");
type PdfDocument = Awaited<ReturnType<PdfjsModule["getDocument"]>["promise"]>;
type PdfPage = Awaited<ReturnType<PdfDocument["getPage"]>>;

let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  pdfjsPromise ??= import("pdfjs-dist").then((mod) => {
    mod.GlobalWorkerOptions.workerSrc = WORKER_SRC;
    return mod;
  });
  return pdfjsPromise;
}

interface Match {
  page: number;
  /** Index of the matched span within that page's rendered text layer, for scrolling/highlighting it specifically. */
  spanIndex: number;
}

const ZOOM_STEPS = [0.75, 1, 1.25, 1.5, 2, 2.5, 3];

/**
 * A from-scratch PDF viewer (canvas render + pdf.js's own TextLayer for the
 * invisible, searchable text overlay) in place of handing the file to
 * Chrome's own PDF plugin via an iframe — that plugin is opaque to us, so
 * there's no way to add our own search UI to it. Runs entirely client-side;
 * no API calls, no per-page cost. Search only finds text actually embedded
 * in the PDF (a scanned page with no text layer has nothing to search,
 * same limitation Chrome's own viewer has).
 */
export function PdfViewer({ fileUrl, jumpToPage }: { fileUrl: string; jumpToPage?: number | null }) {
  const [doc, setDoc] = useState<PdfDocument | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageNum, setPageNum] = useState(jumpToPage ?? 1);
  const [scale, setScale] = useState(1.25);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Match[]>([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [searching, setSearching] = useState(false);
  const pageTextCache = useRef<Map<number, string[]>>(new Map());

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const renderToken = useRef(0);

  // The caller keys this component by document id (see the review dialog),
  // so a new fileUrl always means a fresh mount — the state hooks' initial
  // values already cover the "reset" case, this effect only needs to kick
  // off the actual load.
  useEffect(() => {
    let cancelled = false;
    pageTextCache.current = new Map();
    loadPdfjs()
      .then((pdfjs) => pdfjs.getDocument(fileUrl).promise)
      .then((d) => {
        if (cancelled) return;
        setDoc(d);
        setNumPages(d.numPages);
        setPageNum((p) => Math.min(Math.max(jumpToPage ?? p, 1), d.numPages));
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Couldn't open this PDF");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileUrl]);

  // Jumping to a different flagged page on the SAME document (jumpToPage
  // changes without fileUrl changing, so no remount) — React's documented
  // pattern for syncing state to a prop change without an effect: compare
  // against the previous value during render itself.
  const [prevJumpToPage, setPrevJumpToPage] = useState(jumpToPage);
  if (jumpToPage !== prevJumpToPage) {
    setPrevJumpToPage(jumpToPage);
    if (jumpToPage) setPageNum(jumpToPage);
  }

  // Render the current page: the visual canvas, then the invisible text
  // layer on top of it (positioned by pdf.js to line up with the canvas).
  useEffect(() => {
    if (!doc || !canvasRef.current || !textLayerRef.current) return;
    const myToken = ++renderToken.current;
    let renderTask: ReturnType<PdfPage["render"]> | null = null;

    (async () => {
      const page = await doc.getPage(pageNum);
      if (renderToken.current !== myToken) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current!;
      const ctx = canvas.getContext("2d")!;
      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      renderTask = page.render({
        canvas,
        canvasContext: ctx,
        viewport,
        transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
      });
      await renderTask.promise;
      if (renderToken.current !== myToken) return;

      const textLayerDiv = textLayerRef.current!;
      textLayerDiv.innerHTML = "";
      textLayerDiv.style.width = `${viewport.width}px`;
      textLayerDiv.style.height = `${viewport.height}px`;

      const pdfjs = await loadPdfjs();
      const textLayer = new pdfjs.TextLayer({
        textContentSource: page.streamTextContent(),
        container: textLayerDiv,
        viewport,
      });
      await textLayer.render();
      if (renderToken.current !== myToken) return;

      // Cache this page's span texts from the SAME rendering path search
      // uses (getPageSpanTexts, below) — not pdf.js's raw getTextContent()
      // items, which can merge/split text differently than the text layer
      // actually renders. Using two different extractions was the original
      // bug here: search's match indices didn't line up with the spans on
      // screen, so "current match" highlighting silently pointed at nothing.
      if (!pageTextCache.current.has(pageNum)) {
        const spans = [...textLayerDiv.querySelectorAll("span")];
        pageTextCache.current.set(pageNum, spans.map((s) => s.textContent ?? ""));
      }
      applyHighlight(textLayerDiv, pageNum);
    })().catch((err) => {
      if (renderToken.current === myToken) setLoadError(err instanceof Error ? err.message : "Couldn't render this page");
    });

    return () => {
      // Intentionally reads the CURRENT (not captured) ref value — this
      // invalidates any render that was still in flight when a newer one
      // starts, which is the whole point of the token pattern here.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      renderToken.current++;
      renderTask?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc, pageNum, scale]);

  function applyHighlight(container: HTMLDivElement, page: number) {
    const q = query.trim().toLowerCase();
    const spans = [...container.querySelectorAll("span")];
    const current = matches[matchIndex];
    spans.forEach((span, i) => {
      const text = span.textContent ?? "";
      if (!q || !text.toLowerCase().includes(q)) {
        span.style.backgroundColor = "";
        span.style.outline = "";
        return;
      }
      const isCurrent = current && current.page === page && current.spanIndex === i;
      span.style.backgroundColor = isCurrent ? "rgba(249,115,22,0.6)" : "rgba(250,204,21,0.5)";
      span.style.outline = isCurrent ? "2px solid rgb(249,115,22)" : "";
      if (isCurrent) span.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  // Re-apply highlighting whenever the match cursor moves, without a full re-render.
  useEffect(() => {
    if (textLayerRef.current) applyHighlight(textLayerRef.current, pageNum);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matches, matchIndex]);

  // Off-screen text-layer render for a page that isn't currently on screen —
  // deliberately the SAME construction (TextLayer + querySelectorAll("span"))
  // the visible page uses, rendered into a detached div that's never
  // attached to the document, so its span order/count matches what search
  // will later see rendered on screen when the user jumps to that page.
  async function getPageSpanTexts(p: number): Promise<string[]> {
    const cached = pageTextCache.current.get(p);
    if (cached) return cached;
    const pdfjs = await loadPdfjs();
    const page = await doc!.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const detached = document.createElement("div");
    const textLayer = new pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: detached, viewport });
    await textLayer.render();
    const texts = [...detached.querySelectorAll("span")].map((s) => s.textContent ?? "");
    pageTextCache.current.set(p, texts);
    return texts;
  }

  async function runSearch() {
    const q = query.trim().toLowerCase();
    if (!q || !doc) {
      setMatches([]);
      return;
    }
    setSearching(true);
    try {
      const found: Match[] = [];
      for (let p = 1; p <= numPages; p++) {
        const texts = await getPageSpanTexts(p);
        texts.forEach((t, spanIndex) => {
          if (t.toLowerCase().includes(q)) found.push({ page: p, spanIndex });
        });
      }
      setMatches(found);
      setMatchIndex(0);
      if (found.length > 0) setPageNum(found[0].page);
    } finally {
      setSearching(false);
    }
  }

  function goToMatch(delta: number) {
    if (matches.length === 0) return;
    const next = (matchIndex + delta + matches.length) % matches.length;
    setMatchIndex(next);
    setPageNum(matches[next].page);
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1.5">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pageNum <= 1}
          onClick={() => setPageNum((p) => Math.max(1, p - 1))}
          title="Previous page"
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-16 text-center text-xs tabular-nums text-muted-foreground">
          {numPages > 0 ? `${pageNum} / ${numPages}` : "—"}
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={pageNum >= numPages}
          onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
          title="Next page"
        >
          <ChevronRight className="size-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={scale <= ZOOM_STEPS[0]}
          onClick={() => setScale((s) => ZOOM_STEPS[Math.max(0, ZOOM_STEPS.indexOf(s) - 1)] ?? s)}
          title="Zoom out"
        >
          <ZoomOut className="size-4" />
        </Button>
        <span className="min-w-11 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={scale >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
          onClick={() => setScale((s) => ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, ZOOM_STEPS.indexOf(s) + 1)] ?? s)}
          title="Zoom in"
        >
          <ZoomIn className="size-4" />
        </Button>

        <div className="mx-1 h-5 w-px bg-border" />

        {searchOpen ? (
          <div className="flex flex-1 items-center gap-1">
            <div className="relative flex-1 max-w-xs">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) goToMatch(-1);
                    else if (matches.length) goToMatch(1);
                    else void runSearch();
                  }
                  if (e.key === "Escape") setSearchOpen(false);
                }}
                placeholder="Find in this document…"
                className="h-7 pl-7 text-xs"
              />
            </div>
            <Button type="button" size="sm" variant="outline" disabled={searching || !query.trim()} onClick={runSearch}>
              {searching ? "Searching…" : "Find"}
            </Button>
            {matches.length > 0 && (
              <>
                <span className="text-xs whitespace-nowrap text-muted-foreground">
                  {matchIndex + 1} of {matches.length}
                </span>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => goToMatch(-1)} title="Previous match">
                  <ChevronUp className="size-4" />
                </Button>
                <Button type="button" size="icon-sm" variant="ghost" onClick={() => goToMatch(1)} title="Next match">
                  <ChevronDown className="size-4" />
                </Button>
              </>
            )}
            {!searching && query.trim() && matches.length === 0 && (
              <span className="text-xs whitespace-nowrap text-muted-foreground">No matches</span>
            )}
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              onClick={() => {
                setSearchOpen(false);
                setQuery("");
                setMatches([]);
              }}
              title="Close search"
            >
              <X className="size-4" />
            </Button>
          </div>
        ) : (
          <Button type="button" size="sm" variant="ghost" onClick={() => setSearchOpen(true)}>
            <Search className="size-3.5" />
            Find in document
          </Button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto bg-muted/50 p-4">
        {loadError ? (
          <p className="p-4 text-sm text-destructive">{loadError}</p>
        ) : (
          <div className="relative mx-auto w-fit shadow-md">
            <canvas ref={canvasRef} className="block" />
            <div
              ref={textLayerRef}
              className={cn(
                "textLayer absolute top-0 left-0 [&_span]:absolute [&_span]:origin-[0_0] [&_span]:cursor-text [&_span]:whitespace-pre",
                "text-transparent selection:bg-primary/30"
              )}
            />
          </div>
        )}
      </div>
    </div>
  );
}
