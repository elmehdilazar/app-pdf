"use client";

import { fileUrl } from "@/lib/api";
import type { Thumbnail } from "@/lib/types";

export function PageThumbnailSidebar({
  thumbnails,
  currentPage,
  onSelect
}: {
  thumbnails: Thumbnail[];
  currentPage: number;
  onSelect: (page: number) => void;
}) {
  return (
    <aside className="hidden w-32 shrink-0 overflow-y-auto border-r border-line bg-white p-3 md:block">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Pages</div>
      <div className="space-y-3">
        {thumbnails.map((thumbnail) => (
          <button
            key={thumbnail.pageNumber}
            className={`w-full rounded-md border p-1 text-left transition ${
              thumbnail.pageNumber === currentPage ? "border-brand bg-cyan-50" : "border-line bg-white hover:border-brand"
            }`}
            onClick={() => onSelect(thumbnail.pageNumber)}
          >
            <img className="h-28 w-full rounded object-cover" src={fileUrl(thumbnail.previewUrl)} alt={`Page ${thumbnail.pageNumber}`} />
            <span className="block pt-1 text-center text-xs font-medium text-slate-600">Page {thumbnail.pageNumber}</span>
          </button>
        ))}
      </div>
    </aside>
  );
}
