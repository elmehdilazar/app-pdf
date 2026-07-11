"use client";

import { ChevronLeft, ChevronRight, Maximize2, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";

export function PDFToolbar({
  page,
  pages,
  zoom,
  query,
  onPage,
  onZoom,
  onRotate,
  onFit,
  onSearch,
  onFullscreen
}: {
  page: number;
  pages: number;
  zoom: number;
  query: string;
  onPage: (page: number) => void;
  onZoom: (zoom: number) => void;
  onRotate: () => void;
  onFit: () => void;
  onSearch: (query: string) => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-4 py-3">
      <button className="control" disabled={page <= 1} onClick={() => onPage(page - 1)} title="Previous page">
        <ChevronLeft size={16} />
      </button>
      <input
        className="h-10 w-20 rounded-md border border-line px-3 text-sm"
        type="number"
        min={1}
        max={pages}
        value={page}
        onChange={(event) => onPage(Number(event.target.value))}
      />
      <span className="text-sm text-slate-500">of {pages}</span>
      <button className="control" disabled={page >= pages} onClick={() => onPage(page + 1)} title="Next page">
        <ChevronRight size={16} />
      </button>
      <span className="mx-1 h-6 w-px bg-line" />
      <button className="control" onClick={() => onZoom(Math.max(0.6, zoom - 0.2))} title="Zoom out"><ZoomOut size={16} /></button>
      <button className="control" onClick={() => onZoom(Math.min(3.2, zoom + 0.2))} title="Zoom in"><ZoomIn size={16} /></button>
      <button className="control" onClick={onFit}>Fit width</button>
      <button className="control" onClick={onRotate} title="Rotate page"><RotateCw size={16} /></button>
      <button className="control" onClick={onFullscreen} title="Full screen"><Maximize2 size={16} /></button>
      <div className="ml-auto flex min-w-[220px] items-center rounded-md border border-line bg-white px-3">
        <Search size={15} className="text-slate-400" />
        <input
          className="h-9 w-full border-0 bg-transparent px-2 text-sm outline-none"
          placeholder="Search text"
          value={query}
          onChange={(event) => onSearch(event.target.value)}
        />
      </div>
    </div>
  );
}
