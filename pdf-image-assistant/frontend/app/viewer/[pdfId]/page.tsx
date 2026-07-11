"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { AssistantPanel } from "@/components/AssistantPanel";
import { ExtractedImagePanel } from "@/components/ExtractedImagePanel";
import { ImagePreviewModal } from "@/components/ImagePreviewModal";
import { PageThumbnailSidebar } from "@/components/PageThumbnailSidebar";
import { PDFToolbar } from "@/components/PDFToolbar";
import { SelectedImagesPanel } from "@/components/SelectedImagesPanel";
import { api, fileUrl } from "@/lib/api";
import type { ExtractionPrecision, ManualSelection } from "@/lib/api";
import type { ExtractedImage, PDFDocument, Thumbnail } from "@/lib/types";

type CropDrag = {
  mode: "new" | "move" | "resize";
  handle?: "nw" | "ne" | "sw" | "se";
  start: { x: number; y: number };
  initial: ManualSelection;
};

export default function ViewerPage() {
  const params = useParams<{ pdfId: string }>();
  const pdfId = params.pdfId;
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const pageImageRef = useRef<HTMLDivElement | null>(null);
  const [pdf, setPdf] = useState<PDFDocument | null>(null);
  const [thumbnails, setThumbnails] = useState<Thumbnail[]>([]);
  const [images, setImages] = useState<ExtractedImage[]>([]);
  const [pagesText, setPagesText] = useState<{ pageNumber: number; text: string }[]>([]);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1.4);
  const [rotate, setRotate] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<ExtractedImage | null>(null);
  const [filterPage, setFilterPage] = useState("all");
  const [sort, setSort] = useState("page");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [extractionPrecision, setExtractionPrecision] = useState<ExtractionPrecision>("high");
  const [manualMode, setManualMode] = useState(false);
  const [cropDrag, setCropDrag] = useState<CropDrag | null>(null);
  const [manualSelection, setManualSelection] = useState<ManualSelection | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [metadata, thumbs, existing, text] = await Promise.all([
          api.getPdf(pdfId),
          api.thumbnails(pdfId),
          api.images(pdfId),
          api.text(pdfId).catch(() => ({ pages: [], text: "", pdfId }))
        ]);
        setPdf(metadata);
        setThumbnails(thumbs);
        setImages(existing);
        setPagesText(text.pages);
        setError("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load PDF. Is the backend running?");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [pdfId]);

  async function extract(precision: ExtractionPrecision) {
    if (precision === "manual") {
      setRotate(0);
      setManualSelection(null);
      setManualMode(true);
      setError("");
      return;
    }
    try {
      setExtracting(true);
      const result = await api.extractImages(pdfId, precision);
      setImages(result.images);
      if (result.images.length === 0) setError("No embedded images were found in this PDF.");
      else setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Image extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function pointerPosition(clientX: number, clientY: number) {
    const rect = pageImageRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height))
    };
  }

  function beginCropDrag(event: React.PointerEvent<HTMLElement>, mode: CropDrag["mode"], handle?: CropDrag["handle"]) {
    if (!manualMode) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const point = pointerPosition(event.clientX, event.clientY);
    const initial = manualSelection ?? { x: point.x, y: point.y, width: 0, height: 0 };
    setCropDrag({ mode, handle, start: point, initial });
    if (mode === "new") setManualSelection(initial);
  }

  function updateCropDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!manualMode || !cropDrag) return;
    const point = pointerPosition(event.clientX, event.clientY);
    const { initial, start, mode, handle } = cropDrag;
    if (mode === "new") {
      setManualSelection({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y)
      });
      return;
    }
    if (mode === "move") {
      setManualSelection({
        ...initial,
        x: Math.max(0, Math.min(1 - initial.width, initial.x + point.x - start.x)),
        y: Math.max(0, Math.min(1 - initial.height, initial.y + point.y - start.y))
      });
      return;
    }

    let left = initial.x;
    let top = initial.y;
    let right = initial.x + initial.width;
    let bottom = initial.y + initial.height;
    if (handle?.includes("w")) left = Math.min(point.x, right);
    if (handle?.includes("e")) right = Math.max(point.x, left);
    if (handle?.includes("n")) top = Math.min(point.y, bottom);
    if (handle?.includes("s")) bottom = Math.max(point.y, top);
    setManualSelection({ x: left, y: top, width: right - left, height: bottom - top });
  }

  async function saveManualSelection() {
    if (!manualSelection) return;
    try {
      setExtracting(true);
      const image = await api.extractSelection(pdfId, page, manualSelection);
      setImages((current) => [...current, image]);
      setSelectedIds((current) => new Set([...current, image.id]));
      setManualMode(false);
      setManualSelection(null);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Manual extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  function toggle(image: ExtractedImage) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(image.id)) next.delete(image.id);
      else next.add(image.id);
      return next;
    });
  }

  const searchPages = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return pagesText.filter((item) => item.text.toLowerCase().includes(query)).map((item) => item.pageNumber);
  }, [pagesText, search]);

  if (loading) {
    return <AppShell><main className="p-6 text-sm text-slate-600">Loading viewer...</main></AppShell>;
  }

  return (
    <AppShell>
      <main className="mx-auto max-w-[1800px] px-4 py-4">
        {error && (
          <div className="mb-3 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            <AlertCircle size={16} /> {error}
          </div>
        )}
        <section className="panel flex h-[calc(100dvh-100px)] min-h-[620px] flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-base font-semibold">{pdf?.fileName ?? "PDF"}</h2>
              <p className="text-xs text-slate-500">{pdf?.pages ?? 0} pages - {images.length} extracted images</p>
            </div>
            <Link className="control-primary" href={`/export/${pdfId}`}>Open export</Link>
          </div>
          <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
            <PageThumbnailSidebar thumbnails={thumbnails} currentPage={page} onSelect={setPage} />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <PDFToolbar
                page={page}
                pages={pdf?.pages ?? 1}
                zoom={zoom}
                query={search}
                onPage={(next) => setPage(Math.max(1, Math.min(next || 1, pdf?.pages ?? 1)))}
                onZoom={setZoom}
                onRotate={() => setRotate((value) => (value + 90) % 360)}
                onFit={() => setZoom(1.15)}
                onSearch={setSearch}
                onFullscreen={() => canvasRef.current?.requestFullscreen?.()}
              />
              {search && (
                <div className="border-b border-line bg-cyan-50 px-4 py-2 text-xs text-brandDark">
                  Search matches: {searchPages.length ? searchPages.join(", ") : "No pages found"}
                </div>
              )}
              <div ref={canvasRef} className="relative flex min-h-0 flex-1 items-start justify-center overflow-auto overscroll-contain bg-slate-100 p-6">
                <div
                  ref={pageImageRef}
                  className={`relative shrink-0 ${manualMode ? "cursor-crosshair touch-none select-none" : ""}`}
                  onPointerDown={(event) => beginCropDrag(event, "new")}
                  onPointerMove={updateCropDrag}
                  onPointerUp={() => setCropDrag(null)}
                  onPointerCancel={() => setCropDrag(null)}
                >
                  <img
                    className="block max-w-none rounded-md bg-white shadow-panel"
                    draggable={false}
                    src={fileUrl(`/api/pdfs/${pdfId}/page/${page}/render?zoom=${zoom}&rotate=${rotate}`)}
                    alt={`Rendered page ${page}`}
                  />
                  {manualMode && !manualSelection && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-950/25">
                      <span className="rounded-md border border-white/70 bg-slate-950/75 px-4 py-2 text-sm font-semibold text-white shadow-lg">
                        Click and drag to mark an extraction area
                      </span>
                    </div>
                  )}
                  {manualSelection && (
                    <div
                      className="absolute z-10 cursor-move border-2 border-cyan-400 bg-cyan-300/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.48)]"
                      onPointerDown={(event) => beginCropDrag(event, "move")}
                      style={{
                        left: `${manualSelection.x * 100}%`,
                        top: `${manualSelection.y * 100}%`,
                        width: `${manualSelection.width * 100}%`,
                        height: `${manualSelection.height * 100}%`
                      }}
                    >
                      <button aria-label="Resize from top left" className="absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-cyan-500 shadow" onPointerDown={(event) => beginCropDrag(event, "resize", "nw")} />
                      <button aria-label="Resize from top right" className="absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize rounded-sm border border-white bg-cyan-500 shadow" onPointerDown={(event) => beginCropDrag(event, "resize", "ne")} />
                      <button aria-label="Resize from bottom left" className="absolute -bottom-2 -left-2 h-4 w-4 cursor-nesw-resize rounded-sm border border-white bg-cyan-500 shadow" onPointerDown={(event) => beginCropDrag(event, "resize", "sw")} />
                      <button aria-label="Resize from bottom right" className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-sm border border-white bg-cyan-500 shadow" onPointerDown={(event) => beginCropDrag(event, "resize", "se")} />
                      {manualSelection.width > 0.01 && manualSelection.height > 0.01 && (
                        <span className="absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded bg-slate-950/80 px-2 py-1 text-[11px] font-semibold text-white">
                          {Math.round(manualSelection.width * 100)}% × {Math.round(manualSelection.height * 100)}%
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {manualMode && (
                  <div className="sticky right-3 top-3 ml-3 flex flex-col gap-2 rounded-md border border-cyan-200 bg-white p-3 shadow-panel">
                    <p className="max-w-52 text-xs text-slate-600">Drag to select. Move the box or resize it with the corner handles.</p>
                    <button className="control-primary" disabled={!manualSelection || manualSelection.width < 0.005 || manualSelection.height < 0.005 || extracting} onClick={saveManualSelection}>
                      {extracting ? "Saving..." : "Save selected area"}
                    </button>
                    <button className="control" onClick={() => { setManualMode(false); setManualSelection(null); }}>Cancel</button>
                  </div>
                )}
              </div>
              <SelectedImagesPanel
                pdfId={pdfId}
                images={images}
                selectedIds={selectedIds}
                currentPage={page}
                onSelectAll={() => setSelectedIds(new Set(images.map((image) => image.id)))}
                onSelectPage={() => setSelectedIds(new Set(images.filter((image) => image.pageNumber === page).map((image) => image.id)))}
                onClear={() => setSelectedIds(new Set())}
                onRemove={(id) => setSelectedIds((current) => new Set([...current].filter((value) => value !== id)))}
              />
            </div>
            <ExtractedImagePanel
              images={images}
              selectedIds={selectedIds}
              page={page}
              filterPage={filterPage}
              sort={sort}
              loading={extracting}
              extractionPrecision={extractionPrecision}
              onExtract={extract}
              onPrecision={setExtractionPrecision}
              onToggle={toggle}
              onPreview={setPreview}
              onFilterPage={setFilterPage}
              onSort={setSort}
              onClearSelection={() => setSelectedIds(new Set())}
            />
          </div>
        </section>
        <div className="mt-4">
          <AssistantPanel pages={pagesText} imagePages={images.map((image) => image.pageNumber)} />
        </div>
      </main>
      <ImagePreviewModal image={preview} onClose={() => setPreview(null)} />
    </AppShell>
  );
}
