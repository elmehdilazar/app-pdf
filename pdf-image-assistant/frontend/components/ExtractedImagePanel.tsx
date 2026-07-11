"use client";

import { useState } from "react";
import { Download, Eraser, ImagePlus } from "lucide-react";
import { fileUrl, formatBytes } from "@/lib/api";
import type { ExtractedImage } from "@/lib/types";

export function ExtractedImagePanel({
  images,
  selectedIds,
  page,
  filterPage,
  sort,
  loading,
  onExtract,
  onToggle,
  onPreview,
  onFilterPage,
  onSort,
  onClearSelection
}: {
  images: ExtractedImage[];
  selectedIds: Set<string>;
  page: number;
  filterPage: string;
  sort: string;
  loading: boolean;
  onExtract: () => void;
  onToggle: (image: ExtractedImage) => void;
  onPreview: (image: ExtractedImage) => void;
  onFilterPage: (value: string) => void;
  onSort: (value: string) => void;
  onClearSelection: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [downloadFormat, setDownloadFormat] = useState("original");
  const selectedCount = selectedIds.size;
  const filtered = images
    .filter((image) => (filterPage === "all" ? true : image.pageNumber === Number(filterPage)))
    .sort((a, b) => {
      if (sort === "size") return b.fileSize - a.fileSize;
      if (sort === "width") return b.width - a.width;
      if (sort === "height") return b.height - a.height;
      return a.pageNumber - b.pageNumber;
    });

  async function downloadSelected() {
    setDownloadError("");
    if (selectedIds.size === 0) {
      setDownloadError("Select at least one image first.");
      return;
    }

    try {
      setDownloading(true);
      const response = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds: [...selectedIds],
          format: downloadFormat,
          jpgQuality: 100,
          autoRename: true,
          keepResolution: true
        })
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: "ZIP export failed." }));
        throw new Error(body.detail ?? "ZIP export failed.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pdf-image-assistant-selection.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err instanceof Error ? err.message : "ZIP export failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <aside className="flex w-full flex-col border-l border-line bg-white lg:w-96">
      <div className="border-b border-line p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Extracted images</h2>
            <p className="text-xs text-slate-500">{images.length} embedded image{images.length === 1 ? "" : "s"}</p>
          </div>
          <div className="flex flex-col gap-2">
            <button className="control-primary" onClick={onExtract} disabled={loading}>
              <ImagePlus size={15} /> {loading ? "Extracting" : "Extract"}
            </button>
            <button className="control" onClick={downloadSelected} disabled={selectedCount === 0 || downloading}>
              <Download size={15} /> {downloading ? "Downloading" : "Download selected"}
            </button>
            <button className="control" onClick={onClearSelection} disabled={selectedCount === 0}>
              <Eraser size={15} /> Clear selection
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
          <label className="block text-xs font-medium text-slate-600">
            Download format
            <select
              className="mt-1 h-9 w-full rounded-md border border-line px-2 text-sm text-ink"
              value={downloadFormat}
              onChange={(event) => setDownloadFormat(event.target.value)}
            >
              <option value="original">Original quality</option>
              <option value="png">PNG</option>
              <option value="jpg">JPG 100%</option>
              <option value="webp">WEBP</option>
            </select>
          </label>
          <div className="flex items-end">
            <span className="rounded-md border border-line bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">
              {selectedCount} selected
            </span>
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Original keeps embedded bytes. PNG, JPG, and WEBP convert at full resolution.
        </p>
        {downloadError && <p className="mt-2 text-xs font-medium text-red-700">{downloadError}</p>}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <select className="h-9 rounded-md border border-line px-2 text-sm" value={filterPage} onChange={(event) => onFilterPage(event.target.value)}>
            <option value="all">All pages</option>
            <option value={page}>Current page</option>
          </select>
          <select className="h-9 rounded-md border border-line px-2 text-sm" value={sort} onChange={(event) => onSort(event.target.value)}>
            <option value="page">Page</option>
            <option value="size">File size</option>
            <option value="width">Width</option>
            <option value="height">Height</option>
          </select>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-line p-6 text-center text-sm text-slate-500">
            No images to show. Extract images from the PDF or change the filter.
          </div>
        ) : (
          filtered.map((image) => (
            <article key={image.id} className="rounded-md border border-line p-3">
              <div className="flex gap-3">
                <button className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-slate-100" onClick={() => onPreview(image)}>
                  <img className="h-full w-full object-contain" src={fileUrl(image.previewUrl)} alt={image.fileName} />
                </button>
                <div className="min-w-0 flex-1">
                  <label className="flex items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={selectedIds.has(image.id)} onChange={() => onToggle(image)} />
                    Page {image.pageNumber}
                  </label>
                  <p className="mt-1 text-xs text-slate-500">{image.width} x {image.height} - {image.format} - {formatBytes(image.fileSize)}</p>
                  <a className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`/api/images/${image.id}/download`}>
                    <Download size={13} /> Download original
                  </a>
                </div>
              </div>
            </article>
          ))
        )}
      </div>
    </aside>
  );
}
