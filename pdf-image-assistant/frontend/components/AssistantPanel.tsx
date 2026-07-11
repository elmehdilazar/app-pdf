"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";

export function AssistantPanel({
  pages,
  imagePages
}: {
  pages: { pageNumber: number; text: string }[];
  imagePages: number[];
}) {
  const [keyword, setKeyword] = useState("");
  const resultPages = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    if (!query) return [];
    return pages.filter((page) => page.text.toLowerCase().includes(query)).map((page) => page.pageNumber);
  }, [keyword, pages]);
  const summary = pages
    .flatMap((page) => page.text.split(/(?<=[.!?])\s+/).filter(Boolean))
    .slice(0, 4)
    .join(" ");

  return (
    <section className="panel p-4">
      <h2 className="text-sm font-semibold">Assistant</h2>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Offline helper. AI integration can be connected later without affecting extraction.
      </p>
      <div className="mt-3 flex items-center rounded-md border border-line px-3">
        <Search size={14} className="text-slate-400" />
        <input className="h-9 w-full border-0 px-2 text-sm outline-none" placeholder="Find keyword" value={keyword} onChange={(event) => setKeyword(event.target.value)} />
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <p><span className="font-semibold text-ink">Summary:</span> {summary || "No extractable text found."}</p>
        <p><span className="font-semibold text-ink">Keyword pages:</span> {resultPages.length ? resultPages.join(", ") : "None"}</p>
        <p><span className="font-semibold text-ink">Pages with images:</span> {imagePages.length ? [...new Set(imagePages)].sort((a, b) => a - b).join(", ") : "None yet"}</p>
      </div>
    </section>
  );
}
