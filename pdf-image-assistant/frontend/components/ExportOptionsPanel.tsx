"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Download } from "lucide-react";
import { fileUrl, formatBytes } from "@/lib/api";
import type { ExtractedImage } from "@/lib/types";

export function ExportOptionsPanel({ images, initialSelectedIds }: { images: ExtractedImage[]; initialSelectedIds?: string[] }) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(initialSelectedIds?.length ? initialSelectedIds : images.map((image) => image.id))
  );
  const [format, setFormat] = useState("original");
  const [jpgQuality, setJpgQuality] = useState(100);
  const [autoRename, setAutoRename] = useState(true);
  const [keepResolution, setKeepResolution] = useState(true);
  const [error, setError] = useState("");
  const selected = useMemo(() => images.filter((image) => selectedIds.has(image.id)), [images, selectedIds]);

  useEffect(() => {
    setSelectedIds(new Set(initialSelectedIds?.length ? initialSelectedIds : images.map((image) => image.id)));
  }, [images, initialSelectedIds]);

  function toggle(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function downloadZip() {
    setError("");
    try {
      const response = await fetch("/api/export/zip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageIds: [...selectedIds], format, jpgQuality, autoRename, keepResolution })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ detail: "ZIP export failed." }));
        throw new Error(body.detail);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "pdf-image-assistant-export.zip";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ZIP export failed.");
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <section className="panel overflow-hidden">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-base font-semibold">Selected images</h2>
          <p className="text-sm text-slate-500">{selected.length} of {images.length} images will be exported</p>
        </div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {images.map((image) => (
            <label key={image.id} className="rounded-md border border-line bg-white p-3">
              <div className="flex items-start gap-3">
                <input type="checkbox" checked={selectedIds.has(image.id)} onChange={() => toggle(image.id)} />
                <img className="h-24 w-24 rounded bg-slate-100 object-contain" src={fileUrl(image.previewUrl)} alt={image.fileName} />
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">Page {image.pageNumber}</p>
                  <p className="text-xs text-slate-500">{image.width} x {image.height}</p>
                  <p className="text-xs text-slate-500">{image.format} · {formatBytes(image.fileSize)}</p>
                  <a className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand" href={`/api/images/${image.id}/download?format=${format}&jpg_quality=${jpgQuality}`}>
                    <Download size={13} /> One image
                  </a>
                </div>
              </div>
            </label>
          ))}
        </div>
      </section>
      <aside className="panel h-fit p-5">
        <h2 className="text-base font-semibold">Export options</h2>
        <label className="mt-4 block text-sm font-medium">
          Format
          <select className="mt-2 h-10 w-full rounded-md border border-line px-3" value={format} onChange={(event) => setFormat(event.target.value)}>
            <option value="original">Original format</option>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
          </select>
        </label>
        <label className="mt-4 block text-sm font-medium">
          JPG quality: {jpgQuality}
          <input className="mt-2 w-full" type="range" min={60} max={100} value={jpgQuality} onChange={(event) => setJpgQuality(Number(event.target.value))} />
        </label>
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={keepResolution} onChange={(event) => setKeepResolution(event.target.checked)} />
          Keep original resolution
        </label>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoRename} onChange={(event) => setAutoRename(event.target.checked)} />
          Rename files automatically
        </label>
        <button className="control-primary mt-5 w-full" disabled={selected.length === 0} onClick={downloadZip}>
          <Archive size={16} /> Download selected as ZIP
        </button>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      </aside>
    </div>
  );
}
