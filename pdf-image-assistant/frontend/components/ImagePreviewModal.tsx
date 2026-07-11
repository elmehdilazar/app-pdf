"use client";

import { X } from "lucide-react";
import { fileUrl, formatBytes } from "@/lib/api";
import type { ExtractedImage } from "@/lib/types";

export function ImagePreviewModal({ image, onClose }: { image: ExtractedImage | null; onClose: () => void }) {
  if (!image) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-5">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold">{image.fileName}</h2>
            <p className="text-xs text-slate-500">Page {image.pageNumber} · {image.width} x {image.height} · {formatBytes(image.fileSize)}</p>
          </div>
          <button className="control" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="flex max-h-[75vh] items-center justify-center bg-slate-100 p-5">
          <img className="max-h-[70vh] max-w-full object-contain" src={fileUrl(image.previewUrl)} alt={image.fileName} />
        </div>
      </div>
    </div>
  );
}
