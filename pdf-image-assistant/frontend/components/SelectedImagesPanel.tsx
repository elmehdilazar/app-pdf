"use client";

import { useState } from "react";
import Link from "next/link";
import { Archive, Download, Eraser, Images, X } from "lucide-react";
import { fileUrl } from "@/lib/api";
import type { ExtractedImage } from "@/lib/types";

export function SelectedImagesPanel({
  pdfId,
  images,
  selectedIds,
  currentPage,
  onSelectAll,
  onSelectPage,
  onClear,
  onRemove
}: {
  pdfId: string;
  images: ExtractedImage[];
  selectedIds: Set<string>;
  currentPage: number;
  onSelectAll: () => void;
  onSelectPage: () => void;
  onClear: () => void;
  onRemove: (id: string) => void;
}) {
  const selected = images.filter((image) => selectedIds.has(image.id));
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  async function downloadSelection() {
    setError("");
    if (selected.length === 0) {
      setError("Select at least one image to download.");
      return;
    }

    try {
      setDownloading(true);
      const response = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageIds: [...selectedIds],
          format: "original",
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
      setError(err instanceof Error ? err.message : "ZIP export failed.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="border-t border-line bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-2 flex items-center gap-2 text-sm font-semibold">
          <Images size={16} className="text-brand" /> {selected.length} selected
        </div>
        <button className="control" onClick={onSelectAll}>Select all images</button>
        <button className="control" onClick={onSelectPage}>Select current page</button>
        <button className="control" onClick={onClear}><Eraser size={15} /> Clear</button>
        <button className="control-primary ml-auto" disabled={selected.length === 0 || downloading} onClick={downloadSelection}>
          <Download size={16} /> {downloading ? "Downloading" : "Download selection"}
        </button>
        <Link
          className="control"
          href={`/export/${pdfId}`}
          onClick={() => localStorage.setItem(`pdf-image-assistant:selected:${pdfId}`, JSON.stringify([...selectedIds]))}
        >
          <Archive size={16} /> Export
        </Link>
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-700">{error}</p>}
      {selected.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {selected.map((image) => (
            <div key={image.id} className="relative h-16 w-16 shrink-0 rounded-md border border-line bg-slate-50">
              <img className="h-full w-full object-contain p-1" src={fileUrl(image.previewUrl)} alt={image.fileName} />
              <button
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-white"
                onClick={() => onRemove(image.id)}
                title="Remove from selection"
              >
                <X size={12} />
              </button>
              <span className="absolute bottom-0 left-0 rounded-tr bg-white px-1 text-[10px] text-slate-600">p{image.pageNumber}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
